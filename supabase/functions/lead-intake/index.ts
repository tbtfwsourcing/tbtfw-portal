// TBTFW — LEAD INTAKE — Edge Function v1.4 (Oct 15, 2026)
// v1.4 (portal session two, three change classes):
//   1. DEDUPE: a new lead whose VIN or phone matches a lead from the last 30 days
//      (other than its own trade partner) is still created with a fresh ref and a
//      normal confirmation, but lands with status 'duplicate', a lead_events
//      'duplicate' row on BOTH leads (payload: of/by ref + matched field), no
//      push, and no enrichment (lead-enrich skips status=duplicate). An earlier
//      SELL lead only counts if it reached ready_at (photos landed); an abandoned
//      half-upload never blocks the seller's retry.
//   2. SELL PUSH DEFERRED: /complete no longer pushes plain SELL alerts. lead-enrich
//      sends the enriched push (comps, verdict, tier, draft) within ~2 minutes and
//      a plain fallback at 5 minutes if enrichment has not alerted. TRADE pushes are
//      unchanged (immediate at the sell half's complete, both halves alerted_at).
//   3. SOURCES gains 'text' (?src=text for text-message links).
// v1.3: /inventory also returns past[] (inactive rows that still carry a photo, most recently
//       departed first, max 40) for the choice-screen slideshow. No other change.
// v1.2: /inventory orders by price desc (TBTFW.com default) instead of first_seen_at; first sync stamped
//       38 rows in one second so first-seen order was arbitrary. No other change.
// v1.1: complete_url built from SUPABASE_URL (runtime origin reports http).
// Portal backend for tbtfwsourcing/tbtfw-portal. Routes (path after /lead-intake):
//   OPTIONS *                      CORS preflight
//   GET  /inventory                active tbtfw_inventory rows, newest first, edge-cached 10 min
//   GET  /health                   liveness
//   POST /lead                     create a buy or sell lead (JSON or form-encoded)
//   POST /lead/{id}/complete       verify uploads in Storage, write lead_photos, mark ready, Pushover (TRADE only)
//   POST /lead/{id}/details        optional sell screen-two fields (+ service-record upload URLs)
// Gates: honeypot (field "website"), consent required, per-IP limit 5/hour counted on leads,
// Cloudflare Turnstile when TURNSTILE_SECRET is set (token present -> channel 'form', else 'api').
// Secrets: SUPABASE_SERVICE_ROLE_KEY (platform), TURNSTILE_SECRET (optional),
// PUSHOVER_APP_TOKEN / PUSHOVER_USER_KEY (env first, Vault RPC get_pushover_keys fallback),
// PORTAL_LEADS_URL (optional deep link for pushes; unset in session one).
// verify_jwt is OFF; this function enforces its own gates, same pattern as board.

type Json = Record<string, unknown>;

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, apikey, authorization, x-client-info",
  "Access-Control-Max-Age": "86400",
};

const BUCKET = "lead-photos";
const PHOTO_SLOTS = ["front34", "rear34", "interior", "odometer", "vin_plate", "sticker"];
const MAX_PHOTOS = 20;
const MIN_PHOTOS = 3;
const MAX_RECORDS = 5;
const RATE_PER_IP_PER_HOUR = 5;
const SOURCES = ["bio", "story", "dm", "site", "text"];
const DEDUPE_DAYS = 30;

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

const MAKE_FIX: Record<string, string> = {
  MCLAREN: "McLaren",
  BMW: "BMW",
  "ROLLS-ROYCE": "Rolls-Royce",
  "ROLLS ROYCE": "Rolls-Royce",
  "MERCEDES-BENZ": "Mercedes-Benz",
  "ASTON MARTIN": "Aston Martin",
  "LAND ROVER": "Land Rover",
  "ALFA ROMEO": "Alfa Romeo",
};

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS, ...extra },
  });
}

function fail(status: number, error: string, message: string): Response {
  return json({ ok: false, error, message }, status);
}

function str(v: unknown, max = 500): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

function bool(v: unknown): boolean {
  if (v === true) return true;
  if (v === false || v === undefined || v === null) return false;
  const s = String(v).trim().toLowerCase();
  return s === "true" || s === "on" || s === "1" || s === "yes";
}

function int(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(String(v).replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/(\s+|-)/)
    .map((w) => (w.length ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join("");
}

function fixMake(raw: string | null): string | null {
  if (!raw) return null;
  const up = raw.trim().toUpperCase();
  if (MAKE_FIX[up]) return MAKE_FIX[up];
  return titleCase(raw.trim());
}

function normPhone(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const digits = s.replace(/\D/g, "");
  if (s.startsWith("+")) {
    return digits.length >= 8 && digits.length <= 15 ? "+" + digits : null;
  }
  if (digits.length === 10) return "+1" + digits;
  if (digits.length === 11 && digits.charAt(0) === "1") return "+" + digits;
  return null;
}

function emailOk(s: string | null): boolean {
  return !!s && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) && s.length <= 254;
}

const VIN_TRANS: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, J: 1, K: 2, L: 3, M: 4, N: 5,
  P: 7, R: 9, S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
};
const VIN_WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

function vinValid(v: string): boolean {
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(v)) return false;
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const c = v.charAt(i);
    const val = /[0-9]/.test(c) ? Number(c) : VIN_TRANS[c];
    sum += val * VIN_WEIGHTS[i];
  }
  const r = sum % 11;
  const check = r === 10 ? "X" : String(r);
  return v.charAt(8) === check;
}

function clientIp(req: Request): string {
  const xf = req.headers.get("x-forwarded-for") || "";
  const first = xf.split(",")[0].trim();
  return first || req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || "unknown";
}

function money(n: unknown): string {
  if (n === null || n === undefined) return "no price";
  const v = Number(n);
  if (!Number.isFinite(v)) return "no price";
  return "$" + Math.round(v).toLocaleString("en-US");
}

function miles(n: unknown): string {
  if (n === null || n === undefined) return "mileage unknown";
  const v = Number(n);
  if (!Number.isFinite(v)) return "mileage unknown";
  return Math.round(v).toLocaleString("en-US") + " mi";
}

function identityLine(r: Json): string {
  const parts = [r.year, r.model, r.trim].filter((x) => x !== null && x !== undefined && String(x).trim() !== "");
  return parts.length ? parts.map((x) => String(x)).join(" ") : (r.make ? String(r.make) : "unknown car");
}

function fakeRef(): string {
  const d = new Date(Date.now() - 7 * 3600 * 1000);
  const yymmdd = d.toISOString().slice(2, 10).replace(/-/g, "");
  return "TB-" + yymmdd + "-" + String(Math.floor(1000 + Math.random() * 9000));
}

async function readBody(req: Request): Promise<Json> {
  const ct = (req.headers.get("content-type") || "").toLowerCase();
  try {
    if (ct.includes("application/json")) {
      const b = await req.json();
      return b && typeof b === "object" ? (b as Json) : {};
    }
    if (ct.includes("application/x-www-form-urlencoded")) {
      const t = await req.text();
      const out: Json = {};
      for (const [k, v] of new URLSearchParams(t)) {
        const key = k.replace(/\[\]$/, "");
        if (out[key] === undefined) out[key] = v;
        else if (Array.isArray(out[key])) (out[key] as unknown[]).push(v);
        else out[key] = [out[key], v];
      }
      return out;
    }
    if (ct.includes("multipart/form-data")) {
      const fd = await req.formData();
      const out: Json = {};
      for (const [k, v] of fd.entries()) {
        if (typeof v !== "string") continue;
        const key = k.replace(/\[\]$/, "");
        if (out[key] === undefined) out[key] = v;
        else if (Array.isArray(out[key])) (out[key] as unknown[]).push(v);
        else out[key] = [out[key], v];
      }
      return out;
    }
    const t = await req.text();
    if (!t) return {};
    const b = JSON.parse(t);
    return b && typeof b === "object" ? (b as Json) : {};
  } catch {
    return {};
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!SUPABASE_URL || !SERVICE_KEY) return fail(500, "platform_env_missing", "Server is not configured.");

  const REST = SUPABASE_URL + "/rest/v1";
  const STORAGE = SUPABASE_URL + "/storage/v1";
  const SB: Record<string, string> = {
    apikey: SERVICE_KEY,
    Authorization: "Bearer " + SERVICE_KEY,
    "Content-Type": "application/json",
  };
  const TURNSTILE_SECRET = Deno.env.get("TURNSTILE_SECRET") || "";
  const LEADS_URL = Deno.env.get("PORTAL_LEADS_URL") || "";

  const url = new URL(req.url);
  let path = url.pathname.replace(/^\/functions\/v1/, "").replace(/^\/lead-intake/, "");
  if (!path.startsWith("/")) path = "/" + path;
  path = path.replace(/\/+$/, "") || "/";

  // ---- helpers bound to this request --------------------------------------
  async function sbSelect(table: string, query: string): Promise<Json[]> {
    const r = await fetch(REST + "/" + table + "?" + query, { headers: SB });
    if (!r.ok) throw new Error(table + " select " + r.status + ": " + (await r.text()));
    return await r.json();
  }
  async function sbInsert(table: string, row: Json): Promise<Json> {
    const r = await fetch(REST + "/" + table, {
      method: "POST",
      headers: { ...SB, Prefer: "return=representation" },
      body: JSON.stringify(row),
    });
    if (!r.ok) throw new Error(table + " insert " + r.status + ": " + (await r.text()));
    const rows = await r.json();
    return Array.isArray(rows) ? rows[0] : rows;
  }
  async function sbPatch(table: string, filter: string, patch: Json): Promise<Json | null> {
    const r = await fetch(REST + "/" + table + "?" + filter, {
      method: "PATCH",
      headers: { ...SB, Prefer: "return=representation" },
      body: JSON.stringify(patch),
    });
    if (!r.ok) throw new Error(table + " patch " + r.status + ": " + (await r.text()));
    const rows = await r.json();
    return Array.isArray(rows) && rows.length ? rows[0] : null;
  }
  async function event(leadId: string | null, ev: string, payload: Json): Promise<void> {
    try {
      await fetch(REST + "/lead_events", {
        method: "POST",
        headers: { ...SB, Prefer: "return=minimal" },
        body: JSON.stringify({ lead_id: leadId, event: ev, payload }),
      });
    } catch (_e) { /* events never block the lead */ }
  }
  async function nextRef(): Promise<string> {
    const r = await fetch(REST + "/rpc/next_lead_ref", { method: "POST", headers: SB, body: "{}" });
    if (!r.ok) throw new Error("next_lead_ref " + r.status + ": " + (await r.text()));
    const v = await r.json();
    return String(v);
  }
  async function signUpload(objPath: string): Promise<string> {
    const r = await fetch(STORAGE + "/object/upload/sign/" + BUCKET + "/" + objPath, {
      method: "POST",
      headers: { ...SB, "x-upsert": "true" },
      body: "{}",
    });
    if (!r.ok) throw new Error("sign " + r.status + ": " + (await r.text()));
    const d = await r.json();
    let token = d && d.token ? String(d.token) : "";
    const rel = d && d.url ? String(d.url) : "";
    if (!token && rel.includes("token=")) token = rel.split("token=")[1].split("&")[0];
    if (!token) throw new Error("sign returned no token");
    return STORAGE + "/object/upload/sign/" + BUCKET + "/" + objPath + "?token=" + encodeURIComponent(token);
  }
  async function listObjects(prefix: string): Promise<Json[]> {
    const r = await fetch(STORAGE + "/object/list/" + BUCKET, {
      method: "POST",
      headers: SB,
      body: JSON.stringify({ prefix, limit: 100, offset: 0, sortBy: { column: "name", order: "asc" } }),
    });
    if (!r.ok) throw new Error("list " + r.status + ": " + (await r.text()));
    const rows = await r.json();
    return Array.isArray(rows) ? rows.filter((o: Json) => o && o.id) : [];
  }
  async function pushoverKeys(): Promise<{ token: string; user: string } | null> {
    let token = Deno.env.get("PUSHOVER_APP_TOKEN") || "";
    let user = Deno.env.get("PUSHOVER_USER_KEY") || "";
    if (!token || !user) {
      try {
        const r = await fetch(REST + "/rpc/get_pushover_keys", { method: "POST", headers: SB, body: "{}" });
        if (r.ok) {
          const rows = await r.json();
          const row = Array.isArray(rows) && rows.length ? rows[0] : null;
          token = row && row.app_token ? String(row.app_token) : token;
          user = row && row.user_key ? String(row.user_key) : user;
        }
      } catch (_e) { /* fall through */ }
    }
    return token && user ? { token, user } : null;
  }
  async function push(leadId: string, title: string, message: string, priority = "0"): Promise<boolean> {
    try {
      const keys = await pushoverKeys();
      if (!keys) throw new Error("Pushover keys unavailable");
      const body = new URLSearchParams({ token: keys.token, user: keys.user, title, message, priority });
      if (LEADS_URL) { body.set("url", LEADS_URL); body.set("url_title", "Open leads"); }
      const r = await fetch("https://api.pushover.net/1/messages.json", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
      const d = await r.json();
      if (!r.ok || d.status !== 1) throw new Error("Pushover " + r.status + " " + JSON.stringify(d));
      await event(leadId, "push_sent", { title });
      return true;
    } catch (e) {
      await event(leadId, "push_failed", { error: String((e as Error).message || e), title });
      return false;
    }
  }
  async function decodeVin(vin: string): Promise<Json> {
    try {
      const r = await fetch("https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/" + vin + "?format=json");
      if (!r.ok) return {};
      const d = await r.json();
      const row = d && Array.isArray(d.Results) && d.Results.length ? d.Results[0] : null;
      if (!row) return {};
      const trim = str(row.Trim, 80) || str(row.Series, 80);
      return {
        year: int(row.ModelYear),
        make: fixMake(str(row.Make, 60)),
        model: str(row.Model, 80),
        trim,
      };
    } catch (_e) {
      return {};
    }
  }
  async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
    try {
      const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ secret: TURNSTILE_SECRET, response: token, remoteip: ip }).toString(),
      });
      const d = await r.json();
      return !!(d && d.success);
    } catch (_e) {
      return false;
    }
  }
  // v1.4: find a live lead from the last DEDUPE_DAYS with the same VIN or phone.
  // Excludes the caller's own trade partner (same trade_group_id) and prior
  // duplicates. An earlier sell lead counts only once its photos landed.
  async function findDuplicate(vin: string | null, phone: string, tradeGroupId: string | null): Promise<{ lead: Json; matched: string } | null> {
    const since = new Date(Date.now() - DEDUPE_DAYS * 86400 * 1000).toISOString();
    const ors: string[] = ["phone.eq." + encodeURIComponent(phone)];
    if (vin) ors.push("vin.eq." + encodeURIComponent(vin));
    let q = "created_at=gte." + encodeURIComponent(since) + "&status=neq.duplicate&or=(" + ors.join(",") + ")&select=id,ref,kind,vin,phone,ready_at,trade_group_id&order=created_at.desc&limit=20";
    const rows = await sbSelect("leads", q);
    for (const r of rows) {
      if (tradeGroupId && r.trade_group_id && String(r.trade_group_id) === tradeGroupId) continue;
      if (r.kind === "sell" && !r.ready_at) continue;
      const matched = (vin && r.vin === vin) ? "vin" : "phone";
      return { lead: r, matched };
    }
    return null;
  }

  // ---- GET /health ----------------------------------------------------------
  if (req.method === "GET" && path === "/health") {
    return json({ ok: true, fn: "lead-intake", v: "1.4", turnstile: !!TURNSTILE_SECRET, at: new Date().toISOString() });
  }

  // ---- GET /inventory -------------------------------------------------------
  if (req.method === "GET" && path === "/inventory") {
    try {
      const rows = await sbSelect(
        "tbtfw_inventory",
        "active=eq.true&select=stock_id,vin,year,make,model,trim,mileage,price,color,vdp_url,image_url,last_seen_at&order=price.desc.nullslast,first_seen_at.desc&limit=200",
      );
      let newest = 0;
      for (const r of rows) {
        const t = Date.parse(String(r.last_seen_at || ""));
        if (t > newest) newest = t;
      }
      const stale = !newest || Date.now() - newest > 36 * 3600 * 1000;
      const items = rows.map((r) => ({
        stock_id: r.stock_id, vin: r.vin, year: r.year, make: r.make, model: r.model, trim: r.trim,
        mileage: r.mileage, price: r.price, color: r.color, vdp_url: r.vdp_url, image_url: r.image_url,
      }));
      let past: Json[] = [];
      try {
        const prows = await sbSelect(
          "tbtfw_inventory",
          "active=eq.false&image_url=not.is.null&select=stock_id,year,make,model,trim,image_url,updated_at&order=updated_at.desc&limit=40",
        );
        past = prows.map((r) => ({ stock_id: r.stock_id, year: r.year, make: r.make, model: r.model, trim: r.trim, image_url: r.image_url }));
      } catch (_e) { past = []; }
      return json({ ok: true, count: items.length, stale, generated_at: new Date().toISOString(), items, past }, 200, {
        "Cache-Control": "public, max-age=600, s-maxage=600",
      });
    } catch (e) {
      return fail(500, "inventory_unavailable", String((e as Error).message || e));
    }
  }

  if (req.method !== "POST") return fail(404, "not_found", "No such route.");

  // ---- POST /lead -----------------------------------------------------------
  if (path === "/lead") {
    const b = await readBody(req);
    const ip = clientIp(req);
    const ua = str(req.headers.get("user-agent"), 300);

    // honeypot: fake success, write nothing
    if (str(b.website) || str(b.company_url)) {
      return json({ ok: true, ref: fakeRef(), lead_id: crypto.randomUUID(), upload_urls: [] });
    }

    const kind = (str(b.kind, 10) || "").toLowerCase();
    if (kind !== "buy" && kind !== "sell") return fail(400, "kind_required", "kind must be buy or sell.");

    if (!bool(b.consent)) return fail(400, "consent_required", "Check the agreement box to send this.");

    const full_name = str(b.full_name, 120);
    if (!full_name || full_name.length < 2) return fail(400, "name_required", "Enter your name.");
    const phone = normPhone(b.phone);
    if (!phone) return fail(400, "phone_invalid", "Enter a phone number with area code.");
    const email = str(b.email, 254);
    if (!emailOk(email)) return fail(400, "email_invalid", "Enter a valid email address.");

    // rate limit, all channels: N per IP per hour, counted on leads
    try {
      const since = new Date(Date.now() - 3600 * 1000).toISOString();
      const recent = await sbSelect("leads", "consent_ip=eq." + encodeURIComponent(ip) + "&created_at=gte." + encodeURIComponent(since) + "&select=id&limit=50");
      if (recent.length >= RATE_PER_IP_PER_HOUR) {
        await event(null, "rate_limited", { ip, kind });
        return fail(429, "rate_limited", "Too many submissions from this connection. Try again in an hour.");
      }
    } catch (e) {
      return fail(500, "rate_check_failed", String((e as Error).message || e));
    }

    // turnstile: verified token -> form; absent or unconfigured -> api
    let channel = "api";
    const tsToken = str(b.turnstile_token, 4000) || str(b["cf-turnstile-response"], 4000);
    if (TURNSTILE_SECRET) {
      if (tsToken) {
        const ok = await verifyTurnstile(tsToken, ip);
        if (!ok) return fail(400, "turnstile_failed", "The security check did not pass. Reload the page and try again.");
        channel = "form";
      }
    } else if (tsToken) {
      channel = "form";
    }

    const srcRaw = (str(b.source, 20) || "").toLowerCase();
    const source = SOURCES.includes(srcRaw) ? srcRaw : "direct";

    const row: Json = {
      kind, source, channel, full_name, phone, email,
      message: str(b.message, 2000),
      timeline: str(b.timeline, 40),
      zip: (str(b.zip, 10) || "").replace(/\D/g, "").slice(0, 5) || null,
      contact_pref: str(b.contact_pref, 20),
      best_time: str(b.best_time, 120),
      consent_at: new Date().toISOString(),
      consent_ip: ip,
      user_agent: ua,
    };

    let uploadSlots: { slot: string; content_type: string }[] = [];

    if (kind === "buy") {
      const stock_id = str(b.stock_id, 40);
      const wanted_text = str(b.wanted_text, 500);
      if (!stock_id && !wanted_text) return fail(400, "car_required", "Pick a car or tell us what you are looking for.");
      if (stock_id) {
        const inv = await sbSelect("tbtfw_inventory", "stock_id=eq." + encodeURIComponent(stock_id) + "&select=stock_id,vin,year,make,model,trim,price&limit=1");
        if (!inv.length) return fail(404, "stock_not_found", "That car is no longer listed. Pick another or tell us what you want.");
        row.stock_id = inv[0].stock_id;
        row.vin = inv[0].vin;
        row.year = inv[0].year;
        row.make = inv[0].make;
        row.model = inv[0].model;
        row.trim = inv[0].trim;
      }
      row.wanted_text = wanted_text;
      row.has_trade = bool(b.has_trade);
      row.wants_financing = bool(b.wants_financing);
      if (row.has_trade) row.trade_group_id = str(b.trade_group_id, 40) || crypto.randomUUID();
      row.ready_at = new Date().toISOString();
    } else {
      const vin = (str(b.vin, 17) || "").toUpperCase().replace(/\s/g, "");
      if (!vinValid(vin)) return fail(400, "vin_invalid", "That VIN does not check out. Re-type it from the door jamb or the title.");
      row.vin = vin;
      const mileage = int(b.mileage);
      if (mileage === null || mileage < 0 || mileage > 999999) return fail(400, "mileage_invalid", "Enter the mileage as a number.");
      row.mileage = mileage;
      const asking = int(b.asking_price);
      if (asking === null || asking <= 0 || asking > 100000000) return fail(400, "asking_invalid", "Enter the price you are looking to get.");
      row.asking_price = asking;

      let year = int(b.year);
      let make = fixMake(str(b.make, 60));
      let model = str(b.model, 80);
      let trim = str(b.trim, 80);
      if (!year || !make || !model) {
        const d = await decodeVin(vin);
        year = year || (d.year as number | null);
        make = make || (d.make as string | null);
        model = model || (d.model as string | null);
        trim = trim || (d.trim as string | null);
      }
      row.year = year; row.make = make; row.model = model; row.trim = trim;

      const tg = str(b.trade_group_id, 40);
      if (tg) row.trade_group_id = tg;
      row.intent = str(b.intent, 20);

      // declared photo slots
      let declared: string[] = [];
      if (Array.isArray(b.photos)) {
        declared = (b.photos as unknown[]).map((p) => typeof p === "string" ? p : (p && typeof p === "object" ? String((p as Json).slot || "") : "")).filter(Boolean);
      } else if (str(b.photo_slots)) {
        declared = String(b.photo_slots).split(",").map((s) => s.trim()).filter(Boolean);
      } else {
        const n = int(b.photo_count);
        if (n && n > 0) {
          declared = [];
          for (let i = 0; i < Math.min(n, MAX_PHOTOS); i++) declared.push(i < PHOTO_SLOTS.length ? PHOTO_SLOTS[i] : "extra_" + (i - PHOTO_SLOTS.length + 1));
        }
      }
      const seen = new Set<string>();
      const types: Record<string, string> = {};
      if (Array.isArray(b.photos)) {
        for (const p of b.photos as unknown[]) {
          if (p && typeof p === "object") {
            const pj = p as Json;
            if (pj.slot) types[String(pj.slot)] = String(pj.type || pj.content_type || "image/jpeg");
          }
        }
      }
      for (const s of declared) {
        const ok = PHOTO_SLOTS.includes(s) || /^extra_([1-9]|1[0-4])$/.test(s);
        if (!ok || seen.has(s)) continue;
        seen.add(s);
        const ct = types[s] && EXT[types[s]] && types[s] !== "application/pdf" ? types[s] : "image/jpeg";
        uploadSlots.push({ slot: s, content_type: ct });
      }
      if (uploadSlots.length < MIN_PHOTOS) {
        return fail(400, "photos_required", "Add at least three photos. Declare them as photos: [{slot, type}] and upload to the returned URLs.");
      }
      if (uploadSlots.length > MAX_PHOTOS) uploadSlots = uploadSlots.slice(0, MAX_PHOTOS);
    }

    // v1.4: dedupe on VIN or phone within DEDUPE_DAYS (never blocks; marks).
    let dup: { lead: Json; matched: string } | null = null;
    try {
      dup = await findDuplicate(kind === "sell" ? String(row.vin) : (row.vin ? String(row.vin) : null), phone, row.trade_group_id ? String(row.trade_group_id) : null);
      if (dup) row.status = "duplicate";
    } catch (_e) { dup = null; }

    let lead: Json;
    try {
      row.ref = await nextRef();
      lead = await sbInsert("leads", row);
    } catch (e) {
      return fail(500, "write_failed", String((e as Error).message || e));
    }
    const leadId = String(lead.id);
    await event(leadId, "created", { kind, channel, source, ip, ua, photos_declared: uploadSlots.length, duplicate: !!dup });
    if (dup) {
      await event(leadId, "duplicate", { of: dup.lead.ref, of_id: dup.lead.id, matched: dup.matched });
      await event(String(dup.lead.id), "duplicate", { by: lead.ref, by_id: leadId, matched: dup.matched });
    }

    const upload_urls: Json[] = [];
    if (kind === "sell") {
      try {
        for (const s of uploadSlots) {
          const objPath = "leads/" + leadId + "/" + s.slot + "." + EXT[s.content_type];
          const u = await signUpload(objPath);
          upload_urls.push({ slot: s.slot, path: objPath, content_type: s.content_type, url: u, method: "PUT" });
        }
      } catch (e) {
        await event(leadId, "sign_failed", { error: String((e as Error).message || e) });
        return json({ ok: true, ref: lead.ref, lead_id: leadId, kind, trade_group_id: lead.trade_group_id || null, upload_urls: [], warning: "upload_urls_unavailable" });
      }
    }

    // buy pushes immediately unless it is the first half of a trade (or a duplicate)
    if (kind === "buy" && !dup) {
      if (lead.has_trade) {
        await event(leadId, "push_deferred_trade", { trade_group_id: lead.trade_group_id });
      } else {
        const car = lead.stock_id ? identityLine(lead) + " // stock " + lead.stock_id : "Wanted: " + (lead.wanted_text || "");
        const title = "BUY // " + car + " // " + full_name;
        const lines = [
          (lead.timeline ? String(lead.timeline) : "no timeline") + (lead.wants_financing ? " // financing" : ""),
          phone + " // " + email + (lead.zip ? " // " + lead.zip : ""),
          lead.message ? String(lead.message).slice(0, 300) : "",
          "Ref " + lead.ref + " // " + source + " // " + channel,
        ].filter(Boolean);
        const sent = await push(leadId, title, lines.join("\n"));
        if (sent) await sbPatch("leads", "id=eq." + leadId, { alerted_at: new Date().toISOString() }).catch(() => null);
      }
    }

    return json({
      ok: true,
      ref: lead.ref,
      lead_id: leadId,
      kind,
      trade_group_id: lead.trade_group_id || null,
      identity: { year: lead.year, make: lead.make, model: lead.model, trim: lead.trim },
      upload_urls,
      complete_url: kind === "sell" ? SUPABASE_URL + "/functions/v1/lead-intake/lead/" + leadId + "/complete" : null,
    });
  }

  // ---- POST /lead/{id}/complete  and  /lead/{id}/details ---------------------
  const m = path.match(/^\/lead\/([0-9a-fA-F-]{36})\/(complete|details)$/);
  if (!m) return fail(404, "not_found", "No such route.");
  const leadId = m[1];
  const action = m[2];
  const b = await readBody(req);

  let lead: Json | null = null;
  try {
    const rows = await sbSelect("leads", "id=eq." + leadId + "&select=*&limit=1");
    lead = rows.length ? rows[0] : null;
  } catch (e) {
    return fail(500, "read_failed", String((e as Error).message || e));
  }
  if (!lead) return fail(404, "lead_not_found", "No lead with that id.");

  if (action === "details") {
    if (lead.kind !== "sell") return fail(400, "details_sell_only", "Details apply to sell leads.");
    const patch: Json = { updated_at: new Date().toISOString() };
    const intent = str(b.intent, 20); if (intent) patch.intent = intent.toLowerCase();
    const title_status = str(b.title_status, 20); if (title_status) patch.title_status = title_status.toLowerCase();
    const payoff = int(b.payoff_estimate); if (payoff !== null) patch.payoff_estimate = payoff;
    const lienholder = str(b.lienholder, 120); if (lienholder) patch.lienholder = lienholder;
    if (b.original_owner !== undefined) patch.owner_count = bool(b.original_owner) ? 1 : null;
    const oc = int(b.owner_count); if (oc !== null) patch.owner_count = oc;
    const owned_since = int(b.owned_since); if (owned_since !== null && owned_since > 1900 && owned_since < 2100) patch.owned_since = owned_since;
    if (b.has_records !== undefined) patch.has_records = bool(b.has_records);
    const mods = str(b.mods_text, 2000); if (mods) patch.mods_text = mods;
    const condition = str(b.condition, 20); if (condition) patch.condition = condition.toLowerCase();
    const zip = (str(b.zip, 10) || "").replace(/\D/g, "").slice(0, 5); if (zip) patch.zip = zip;
    const timeline = str(b.timeline, 40); if (timeline) patch.timeline = timeline;
    const contact_pref = str(b.contact_pref, 20); if (contact_pref) patch.contact_pref = contact_pref;
    const best_time = str(b.best_time, 120); if (best_time) patch.best_time = best_time;

    try {
      await sbPatch("leads", "id=eq." + leadId, patch);
    } catch (e) {
      return fail(500, "write_failed", String((e as Error).message || e));
    }

    const upload_urls: Json[] = [];
    if (Array.isArray(b.records)) {
      let n = 0;
      for (const r of b.records as unknown[]) {
        if (n >= MAX_RECORDS) break;
        const rj = r && typeof r === "object" ? (r as Json) : {};
        const ct = EXT[String(rj.type || rj.content_type || "")] ? String(rj.type || rj.content_type) : "image/jpeg";
        n++;
        const slot = "record_" + n;
        const objPath = "leads/" + leadId + "/" + slot + "." + EXT[ct];
        try {
          const u = await signUpload(objPath);
          upload_urls.push({ slot, path: objPath, content_type: ct, url: u, method: "PUT" });
        } catch (_e) { /* skip this record */ }
      }
      if (upload_urls.length) patch.has_records = true;
    }
    await event(leadId, "details", { fields: Object.keys(patch).filter((k) => k !== "updated_at"), records_declared: upload_urls.length });
    return json({ ok: true, ref: lead.ref, lead_id: leadId, upload_urls });
  }

  // complete: trust Storage, not the client
  let objects: Json[] = [];
  try {
    objects = await listObjects("leads/" + leadId);
  } catch (e) {
    return fail(500, "list_failed", String((e as Error).message || e));
  }
  const dims = b.dims && typeof b.dims === "object" ? (b.dims as Record<string, unknown>) : {};
  let photoCount = 0;
  for (const o of objects) {
    const name = String(o.name || "");
    const slot = name.replace(/\.[a-z0-9]+$/i, "");
    const meta = (o.metadata && typeof o.metadata === "object" ? o.metadata : {}) as Json;
    const d = Array.isArray(dims[slot]) ? (dims[slot] as unknown[]) : null;
    const prow: Json = {
      lead_id: leadId,
      slot,
      storage_path: "leads/" + leadId + "/" + name,
      bytes: int(meta.size),
      content_type: str(meta.mimetype, 60),
      width: d ? int(d[0]) : null,
      height: d ? int(d[1]) : null,
    };
    try {
      await fetch(REST + "/lead_photos?on_conflict=storage_path", {
        method: "POST",
        headers: { ...SB, Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(prow),
      });
    } catch (_e) { /* continue */ }
    if (!slot.startsWith("record_")) photoCount++;
  }
  if (photoCount === 0 && lead.kind === "sell") {
    await event(leadId, "complete_no_photos", { objects: objects.length });
    return fail(400, "no_photos", "No photos landed in storage yet. Upload to the signed URLs, then call complete again.");
  }

  const patch: Json = { photo_count: photoCount, updated_at: new Date().toISOString() };
  if (!lead.ready_at) patch.ready_at = new Date().toISOString();
  let updated: Json = lead;
  try {
    updated = (await sbPatch("leads", "id=eq." + leadId, patch)) || lead;
  } catch (e) {
    return fail(500, "write_failed", String((e as Error).message || e));
  }
  await event(leadId, "complete", { photo_count: photoCount, objects: objects.length });

  // v1.4: plain SELL pushes are deferred to lead-enrich (enriched push within ~2
  // minutes, plain fallback at 5). TRADE pushes stay immediate. Duplicates never push.
  if (!updated.alerted_at && lead.kind === "sell" && updated.status !== "duplicate") {
    let buyHalf: Json | null = null;
    if (updated.trade_group_id) {
      try {
        const rows = await sbSelect("leads", "trade_group_id=eq." + updated.trade_group_id + "&kind=eq.buy&select=*&limit=1");
        buyHalf = rows.length ? rows[0] : null;
      } catch (_e) { buyHalf = null; }
    }
    if (buyHalf) {
      const sellCar = identityLine(updated) + " // " + miles(updated.mileage) + " // asking " + money(updated.asking_price);
      const buyCar = buyHalf.stock_id ? identityLine(buyHalf) + " // stock " + buyHalf.stock_id : "Wanted: " + (buyHalf.wanted_text || "");
      const title = "TRADE // " + buyCar + " // for " + identityLine(updated) + " // " + updated.full_name;
      const lines: string[] = [];
      lines.push("Trade in: " + sellCar);
      lines.push("VIN " + updated.vin + " // " + photoCount + " photos");
      if (buyHalf.timeline) lines.push(String(buyHalf.timeline) + (buyHalf.wants_financing ? " // financing" : ""));
      lines.push(updated.phone + " // " + updated.email + (updated.zip ? " // " + updated.zip : ""));
      lines.push("Ref " + updated.ref + " + " + buyHalf.ref + " // " + updated.source + " // " + updated.channel);
      const sent = await push(leadId, title, lines.join("\n"));
      if (sent) {
        const now = new Date().toISOString();
        await sbPatch("leads", "id=eq." + leadId, { alerted_at: now }).catch(() => null);
        await sbPatch("leads", "id=eq." + String(buyHalf.id), { alerted_at: now }).catch(() => null);
      }
    } else {
      await event(leadId, "push_deferred_enrich", { photo_count: photoCount });
    }
  }

  return json({ ok: true, ref: updated.ref, lead_id: leadId, photo_count: photoCount, ready: true });
});
