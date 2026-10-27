// TBTFW — LEAD ENRICH — Edge Function v1.7 (Oct 24, 2026; links moved to concierge.tbtfw.com Oct 27)
// v1.7: NOTHING GOES TO THE CUSTOMER BY ITSELF; GARETT GETS THE LEAD BY EMAIL. Standing
//       decision (G, Oct 24 2026, replacing v1.6's auto-email): every lead is emailed to
//       LEAD_EMAIL_TO (default MS_MAILBOX, garett@tbtfw.com) from the portal mailbox through
//       Microsoft Graph, once, right after enrichment: a one-line summary, Text / Call / Email /
//       Open buttons (Text through the site's text.html, tel: and mailto:, prefilled with the AI's suggested reply), a
//       plain copy-paste block of the submission, the AI notes and the suggested reply. The
//       draft still waits in the queue and only goes out on a tap. SWEEP G emails any lead
//       still unemailed LEAD_EMAIL_FALLBACK_MINUTES after it was ready (AI stuck or failed,
//       duplicates, which are never enriched), so no lead is missed. The v1.6 auto-email and
//       the Resend acknowledgement stay in the code behind AUTO_SEND (false). Body
//       {"lead_email_lead_id": "..."} emails one lead now (+ "force": true to send it again).
// v1.6: AUTO-EMAIL WHEN IT IS IN STOCK. Standing decision (G, Oct 24 2026):
//       the first answer to a buyer whose car is in inventory, and who gave
//       an email, goes out without approval; everything else stays a draft.
//       It is written as an email, stored status 'approved' with approved_at
//       AUTO_SEND_MINUTES out (the queue shows it with Cancel), pushed as
//       AUTO-EMAIL, and sent by SWEEP F through lead-crm when due, so the
//       mailbox, threading and audit trail are those of a tapped Send. Only a
//       clean draft qualifies: BUYER, request_in_stock, not needs_review (the
//       model's own doubt, e.g. a garbled listing detail), inventory cars
//       named, no CHECK issues. Not in stock: a draft on the usual channel that reads
//       as handled and buys time. Tone rules: a private client advisor, never
//       a salesman; several matching cars are each covered with their link.
//       The Resend acknowledgement is skipped when an auto-email is queued.
// v1.5: INVENTORY-AWARE DRAFTS. Every buyer draft (and a seller's, when they
//       want to trade) sees the live inventory: tbtfw_inventory for what is
//       active, plus one fetch of tbtfw.com/inventory for each car's colours,
//       engine, gearbox and photo count. A car is called available, linked or
//       described only when it is in that list, with details copied from it.
//       Standing decision (G, Oct 24 2026): TBTFW sources anything, so a car
//       we do not have is written as a confident sourcing deal, never as
//       "available" and never as a search; the flag tells Garett NOT IN STOCK.
//       Every draft ends on one question that moves toward the sale.
//       save_draft gains cars_mentioned; code checks each draft (inventory
//       stock numbers, listing links, money figures, scrambling language,
//       text length) and puts problems in the flag as "CHECK: ...".
//       Effort is per kind (first touch and reply high, follow-up medium);
//       requests opt into server-side refusal fallbacks. Batches drop to 2.
//       Body {"preview_lead_ids": [...]} drafts without writing anything but
//       a 'draft_preview' lead_events row; deployed again as
//       lead-enrich-preview, previews are the only route that slug serves,
//       and there it also takes made-up test leads ({"preview_leads": [...]}).
// v1.4: OPUS 5.5. Every draft is now written by claude-opus-5-5 (was Haiku 4.5).
//       Opus 5.5 runs adaptive thinking on every request and rejects forced
//       tool_choice, so the call is tool_choice auto + strict tool schema + a
//       system-prompt instruction to always call the tool; max_tokens covers
//       thinking plus text; effort is a constant (EFFORT) next to the model id.
//       Timeout per call 90s. No other behavior change.
// v1.3: THE VOICE LAYER. Every draft (first touch, follow-up, reply) is
//       written by Haiku under G's own prompt, read from portal_kv key
//       'voice_prompt' (value.text; DEFAULT_VOICE below is the fallback), so
//       the verbiage can be edited without a redeploy. Standing decisions
//       (G, Oct 14 2026): Garett is customer-facing and signs; channel is
//       text when the lead has a phone, email only when it has none; follow
//       up to silence twice, then stop; junk leads are logged, never messaged.
//       Per lead Haiku returns classification (BUYER / SELLER / JUNK),
//       draft, missing_info and flag -> leads.classification / missing_info /
//       flag. JUNK: leads.status 'junk', no draft, no push, event
//       'classified_junk'. Seller drafts ask only for what the form did not
//       capture. Buyer drafts carry the tbtfw.com listing link
//       (tbtfw_inventory.vdp_url) and its availability.
//       SWEEP E: REPLY DRAFTS — a lead whose newest message is inbound with no
//       draft waiting gets a reply draft (thread as context, greeting dropped
//       in rapid back-and-forth), leads.status 'replied', push
//       "REPLY DRAFT // identity". Nothing sends without a tap.
// v1.2: SWEEP D follow-up drafts (stage 1 at +2d after the last sent message,
//       stage 2 at +3d after stage 1; two stages max; skipped counts as done).
// v1.1: draft prompt states the photo count already on file.
// Runs every two minutes from pg_cron (anon bearer, like the other jobs).
// One invocation = sweeps, then enrichment of up to ENRICH_BATCH ready leads.
//
// ENRICHMENT (sell lead): canonicalize vPIC identity to the board's form
//   (canonicalizeIdentity + normalizeTrim, byte-identical to forsale-ingest
//   v1.10 / ilusso-sitemap-join v1.2 — do not edit here without editing there)
//   -> spec-inference {lead_id} (Haiku grades the car, writes detected_specs,
//   unmatched_tokens, desirability_tier/why onto the lead) -> score_identity()
//   (the board's verdict engine) -> comps/verdict -> voice draft (first touch,
//   lead_messages DRAFT) -> Resend auto-reply (if RESEND_API_KEY set) ->
//   enriched Pushover (priority 1 on CHASE) -> enriched_at.
//   Buy lead: classification + draft (+ auto-reply) only.
//   Model failure: comps + verdict still land; enrich_attempts++ and
//   enrich_error set; retried next tick; after MAX_ATTEMPTS the lead is
//   stamped enriched_at with the error kept, so the queue never spins.
// SWEEPS (every tick): A fallback push (sell, ready > 5 min, no alert);
//   B orphaned trade; C stuck upload completion; D follow-ups; E reply drafts.
// MAINTENANCE: body {"purge_lead_ids":[...]} deletes Storage objects under
//   leads/{id}/. Body {"lead_id": "..."} enriches one lead now (+
//   "force_push": true to resend the enriched push). Body
//   {"follow_up_lead_id": "..."} runs sweep D for one lead; body
//   {"reply_lead_id": "..."} runs sweep E for one lead.
// Secrets: SUPABASE_SERVICE_ROLE_KEY (platform); ANTHROPIC_KEY; PUSHOVER_APP_TOKEN /
//   PUSHOVER_USER_KEY (env first, Vault RPC get_pushover_keys fallback);
//   RESEND_API_KEY (optional); RESEND_FROM (optional); PORTAL_LEADS_URL (optional).

type Json = Record<string, unknown>;

const ENRICH_BATCH = 2;
const MAX_ATTEMPTS = 5;
const FALLBACK_MINUTES = 5;
const ORPHAN_MINUTES = 10;
const STUCK_MINUTES = 10;
const STUCK_MAX_HOURS = 48;
const FOLLOW_UP_DAYS = [2, 3];
const FOLLOW_UP_MAX = 2;
const FOLLOW_UP_BATCH = 2;
const REPLY_BATCH = 2;
const RAPID_MINUTES = 30; // inbound within this of our last message = rapid back-and-forth, drop the greeting
const BUCKET = "lead-photos";
const SIGN_OFF = "Garett";
const DEFAULT_FROM = "TBTFW <sales@tbtfw.com>";
const MODEL = "claude-opus-5-5"; // v1.4; was claude-haiku-4-5
// Adaptive-thinking effort per draft kind: low = faster and cheaper, high = slower and deeper.
// A reply is the customer talking back and a first touch sets the tone, so both think harder.
const EFFORT: Record<string, string> = { first_touch: "high", reply: "high", follow_up: "medium" };
// Server-side refusal fallback: a declined request is re-run on the model Anthropic recommends.
const FALLBACK_BETA = "server-side-fallback-2026-07-01";
const INVENTORY_PAGE = "https://www.tbtfw.com/inventory";
const PREVIEW_MAX = 5;
// How long an in-stock auto-email waits in the queue, cancellable, before it goes out.
const AUTO_SEND_MINUTES = 5;
// v1.7: off. Nothing reaches the customer without Garett's tap (the in-stock auto-email and the
// Resend acknowledgement both sit behind this).
const AUTO_SEND = false;
// v1.7: a ready lead the AI has not finished with is emailed to Garett anyway after this long.
const LEAD_EMAIL_FALLBACK_MINUTES = 10;
const GRAPH_SCOPES = "offline_access User.Read Mail.Send Mail.ReadWrite";
const CRM_DEFAULT_URL = "https://concierge.tbtfw.com/leads.html";
// Email apps (Outlook among them) strip sms: links, so Text goes through this page, which hands
// the number and the reply (in the fragment, never sent to a server) to Messages.
const TEXT_PAGE_URL = "https://concierge.tbtfw.com/text.html";
const DEFAULT_VOICE =
  "You are Garett, a salesperson at TBTFW, a family-owned hypercar and luxury dealership in Beverly Hills. You write my CRM messages in MY voice: direct, plain-spoken, short. No sales fluff, no corporate speak, no hype. If it sounds like a salesman wrote it, rewrite it.\n\n" +
  "For every lead, classify BUYER, SELLER, or JUNK first. Draft only. Nothing is ever sent without my explicit approval.\n\n" +
  "BUYER opener: \"Hi [name], this is Garett with TBTFW in Beverly Hills. The [car] is available. Happy to send photos or answer any questions.\" Never ask what number gets a deal done in an opener. Never name the lead source. Never frame an internet inquiry as a returned call.\n\n" +
  "SELLER opener: ask for whatever we do NOT already have: VIN, photos, current miles, and what they are looking to get for it. If the lead already gave one of those, do not ask for it again. Also find out, when unknown: trade-in interest, and whether they own it outright, have a loan, or a lease.\n\n" +
  "Rules that never break: never name a price first; get them to name theirs. Never offer a build or spec sheet unless they ask. If they ask for photos, send the tbtfw.com listing link and say the listing has beautiful, gorgeous photos. Every fact and price must match the exact car and VIN they asked about; never invent anything. Match their channel: text if they have a phone, email only if they have no phone. In rapid back-and-forth, drop the greeting. Follow up to silence twice at most, then stop. Junk leads: log silently, never message.\n\nSign-off: Garett.";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// ---- Trim normalization (byte-identical to forsale-ingest v1.10) ----
const TRIM_MAP: Record<string, string> = {
  "touring package": "Touring",
  "weissach package": "Weissach",
  "clubsport package": "Clubsport",
};
function normalizeTrim(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  let t = String(raw).trim();
  if (t === "") return null;
  const mapped = TRIM_MAP[t.toLowerCase()];
  if (mapped) return mapped;
  t = t.replace(/\s+package$/i, "").trim();
  return t === "" ? null : t;
}

// ---- v1.4 PORSCHE 911 IDENTITY CANONICALIZATION (deterministic) ----
const MODEL_FORM_SUFFIXES = ["GT3 RS", "GT3", "GT2 RS", "GT2", "GT1", "R"];
function canonicalizeIdentity(
  make: unknown,
  model: string,
  trim: string | null,
): { model: string; trim: string | null } {
  if (typeof make !== "string" || make.trim().toLowerCase() !== "porsche") {
    return { model, trim };
  }
  const m = model.trim();
  if (/^911$/i.test(m) && trim !== null) {
    const t = trim.trim();
    const tLower = t.toLowerCase();
    for (const mf of MODEL_FORM_SUFFIXES) {
      const mfLower = mf.toLowerCase();
      if (tLower === mfLower) return { model: "911 " + mf, trim: null };
      if (tLower.startsWith(mfLower + " ")) {
        const rest = t.slice(mf.length).trim();
        return { model: "911 " + mf, trim: rest === "" ? null : rest };
      }
    }
  }
  const suffixMatch = m.match(/^911\s+(.+)$/i);
  if (!suffixMatch) return { model, trim };
  const suffix = suffixMatch[1].trim();
  const sLower = suffix.toLowerCase();
  for (const mf of MODEL_FORM_SUFFIXES) {
    const mfLower = mf.toLowerCase();
    if (sLower === mfLower) return { model: "911 " + mf, trim };
    if (sLower.startsWith(mfLower + " ")) {
      const rest = suffix.slice(mf.length).trim();
      const newTrim = trim ? (rest + " " + trim).trim() : (rest === "" ? null : rest);
      return { model: "911 " + mf, trim: newTrim };
    }
  }
  const newTrim = trim ? (suffix + " " + trim).trim() : suffix;
  return { model: "911", trim: newTrim };
}

function money(n: unknown): string {
  const v = Number(n);
  if (n === null || n === undefined || !Number.isFinite(v)) return "no price";
  return "$" + Math.round(v).toLocaleString("en-US");
}
function miles(n: unknown): string {
  const v = Number(n);
  if (n === null || n === undefined || !Number.isFinite(v)) return "mileage unknown";
  return Math.round(v).toLocaleString("en-US") + " mi";
}
function identityLine(r: Json): string {
  const model = (r.canon_model as string) || (r.model as string) || null;
  const trim = (r.canon_trim as string) || (r.trim as string) || null;
  const parts = [r.year, model, trim].filter((x) => x !== null && x !== undefined && String(x).trim() !== "");
  return parts.length ? parts.map((x) => String(x)).join(" ") : (r.make ? String(r.make) : "unknown car");
}
function firstName(full: unknown): string {
  const s = String(full || "").trim();
  if (!s) return "there";
  return s.split(/\s+/)[0];
}
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function pickChannel(L: Json): "sms" | "email" {
  return String(L.phone || "").replace(/\D/g, "").length >= 10 ? "sms" : "email";
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_KEY") || "";
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
  const RESEND_FROM = Deno.env.get("RESEND_FROM") || DEFAULT_FROM;
  const LEADS_URL = Deno.env.get("PORTAL_LEADS_URL") || "";
  const MS_TENANT = Deno.env.get("MS_TENANT_ID") || "";
  const MS_CLIENT_ID = Deno.env.get("MS_CLIENT_ID") || "";
  const MS_CLIENT_SECRET = Deno.env.get("MS_CLIENT_SECRET") || "";
  const LEAD_EMAIL_TO = (Deno.env.get("LEAD_EMAIL_TO") || Deno.env.get("MS_MAILBOX") || "").trim();
  if (!SUPABASE_URL || !SERVICE_KEY) return json({ ok: false, error: "platform env missing" }, 500);

  const REST = SUPABASE_URL + "/rest/v1";
  const STORAGE = SUPABASE_URL + "/storage/v1";
  const FUNCTIONS = SUPABASE_URL + "/functions/v1";
  const SB: Record<string, string> = {
    apikey: SERVICE_KEY,
    Authorization: "Bearer " + SERVICE_KEY,
    "Content-Type": "application/json",
  };

  const startedAt = Date.now();
  const body = await req.json().catch(() => ({})) as Json;
  // The same code deployed as lead-enrich-preview serves previews and nothing else.
  const PREVIEW_ONLY = new URL(req.url).pathname.includes("lead-enrich-preview");
  if (PREVIEW_ONLY && !Array.isArray(body.preview_lead_ids) && !Array.isArray(body.preview_leads)) {
    return json({ ok: false, error: "this slug only serves previews" }, 400);
  }

  // ---- helpers ------------------------------------------------------------
  async function sbSelect(table: string, query: string): Promise<Json[]> {
    const r = await fetch(REST + "/" + table + "?" + query, { headers: SB });
    if (!r.ok) throw new Error(table + " select " + r.status + ": " + (await r.text()));
    return await r.json();
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
  async function event(leadId: string | null, ev: string, payload: Json): Promise<void> {
    try {
      await fetch(REST + "/lead_events", {
        method: "POST",
        headers: { ...SB, Prefer: "return=minimal" },
        body: JSON.stringify({ lead_id: leadId, event: ev, payload }),
      });
    } catch (_e) { /* events never block */ }
  }
  async function hasEvent(leadId: string, ev: string): Promise<boolean> {
    const rows = await sbSelect("lead_events", "lead_id=eq." + leadId + "&event=eq." + ev + "&select=id&limit=1");
    return rows.length > 0;
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
  async function push(leadId: string, ev: string, title: string, message: string, priority = 0): Promise<boolean> {
    try {
      const keys = await pushoverKeys();
      if (!keys) throw new Error("Pushover keys unavailable");
      const form = new URLSearchParams({ token: keys.token, user: keys.user, title, message, priority: String(priority) });
      if (LEADS_URL) { form.set("url", LEADS_URL); form.set("url_title", "Open leads"); }
      const r = await fetch("https://api.pushover.net/1/messages.json", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      });
      const d = await r.json();
      if (!r.ok || d.status !== 1) throw new Error("Pushover " + r.status + " " + JSON.stringify(d));
      await event(leadId, ev, { title, priority });
      return true;
    } catch (e) {
      await event(leadId, "push_failed", { error: String((e as Error).message || e), title, via: ev });
      return false;
    }
  }

  // ---- v1.7: the lead email to Garett ---------------------------------------------------
  // Sent from the portal mailbox (the Outlook account lead-crm sends from) through Microsoft
  // Graph to LEAD_EMAIL_TO. lead-inbox ignores mail from that mailbox, so it never lands in a
  // lead's thread. Once per lead ('lead_emailed'); a failed send is retried by SWEEP G.
  async function graphAccess(): Promise<string> {
    if (!MS_TENANT || !MS_CLIENT_ID || !MS_CLIENT_SECRET) throw new Error("Microsoft secrets missing");
    const rr = await fetch(REST + "/rpc/get_ms_refresh_token", { method: "POST", headers: SB, body: "{}" });
    const refresh = rr.ok ? await rr.json() : null;
    if (!refresh) throw new Error("mailbox not connected");
    const form = new URLSearchParams({ client_id: MS_CLIENT_ID, client_secret: MS_CLIENT_SECRET, grant_type: "refresh_token", refresh_token: String(refresh), scope: GRAPH_SCOPES });
    const r = await fetch("https://login.microsoftonline.com/" + MS_TENANT + "/oauth2/v2.0/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.access_token) throw new Error("Graph token " + r.status + ": " + String(d.error_description || d.error || "").slice(0, 200));
    if (d.refresh_token && d.refresh_token !== refresh) {
      try { await fetch(REST + "/rpc/set_ms_refresh_token", { method: "POST", headers: SB, body: JSON.stringify({ p_token: d.refresh_token }) }); } catch (_e) { /* keep the old one */ }
    }
    return String(d.access_token);
  }
  function prettyPhone(p: unknown): string {
    const d = String(p || "").replace(/\D/g, "");
    const ten = d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
    return ten.length === 10 ? "(" + ten.slice(0, 3) + ") " + ten.slice(3, 6) + "-" + ten.slice(6) : String(p || "");
  }
  // Returns what happened ("sent", "already emailed", ...); throws when the send fails.
  async function leadEmail(leadId: string, force = false): Promise<string> {
    if (!LEAD_EMAIL_TO) return "no recipient";
    if (!force && await hasEvent(leadId, "lead_emailed")) return "already emailed";
    const L = (await sbSelect("leads", "id=eq." + leadId + "&select=*&limit=1"))[0];
    if (!L) return "lead not found";
    const isSell = L.kind === "sell";
    const draft = (await sbSelect("lead_messages", "lead_id=eq." + leadId + "&direction=eq.out&purpose=eq.first_touch&select=channel,subject,body,status&order=created_at.desc&limit=1"))[0] || null;
    const inv = !isSell && L.stock_id
      ? (await sbSelect("tbtfw_inventory", "stock_id=eq." + encodeURIComponent(String(L.stock_id)) + "&select=price,vdp_url,active&limit=1"))[0] || null
      : null;

    const car = [L.year, L.make, L.canon_model || L.model, L.canon_trim || L.trim].filter((x) => x !== null && x !== undefined && String(x).trim() !== "").join(" ");
    const label = L.status === "duplicate" ? "Repeat" : L.status === "junk" ? "AI thinks junk" : "";
    const what = isSell
      ? "Seller offering their " + (car || "car") + (L.mileage !== null && L.mileage !== undefined ? ", " + miles(L.mileage) : "") + (L.asking_price ? ", asking " + money(L.asking_price) : "")
      : L.stock_id
        ? "Buyer asking about the " + (car || "car") + " (stock " + L.stock_id + (inv ? (inv.active ? ", in stock" : ", no longer listed") : "") + ")"
        : "Buyer looking for " + (L.wanted_text ? "“" + String(L.wanted_text).slice(0, 120) + "”" : "a car");
    const summary = [what, L.contact_pref ? "prefers " + String(L.contact_pref).toLowerCase() : "", L.timeline ? "timeline: " + String(L.timeline).toLowerCase() : "", L.has_trade ? "has a trade-in" : ""].filter(Boolean).join(" · ") + ".";
    const subject = (label ? "[" + label + "] " : "") + "New lead · " + (isSell ? "SELL" : "BUY") + " · " + (car || String(L.wanted_text || "car").slice(0, 60)) + " · " + (L.full_name || "no name") + " · " + L.ref;

    // The submission as plain lines, to paste into another CRM or a note.
    const when = new Date(String(L.created_at)).toLocaleString("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    const yesNo = (v: unknown) => (v === true ? "yes" : "no");
    const copy: string[] = [
      "NEW LEAD " + L.ref + " (" + when + " PT)" + (label ? " [" + label + "]" : ""),
      "Type: " + (isSell ? "Sell" + (L.trade_group_id ? " (a trade-in)" : "") : "Buy" + (L.has_trade ? " (has a trade-in)" : "")),
      "Car: " + (isSell ? car : L.stock_id ? car + " · stock " + L.stock_id + (inv && inv.price ? " · " + money(inv.price) : "") : String(L.wanted_text || "not specified")),
      "Name: " + (L.full_name || ""),
      "Phone: " + prettyPhone(L.phone),
      "Email: " + (L.email || ""),
    ];
    if (L.contact_pref || L.best_time) copy.push("Prefers: " + [L.contact_pref, L.best_time].filter(Boolean).join(", "));
    if (L.zip) copy.push("ZIP: " + L.zip);
    if (L.timeline) copy.push("Timeline: " + L.timeline);
    if (isSell) {
      copy.push("VIN: " + (L.vin || "") + " · Mileage: " + miles(L.mileage) + " · Asking: " + money(L.asking_price));
      copy.push([L.intent ? "Intent: " + L.intent : "", L.condition ? "Condition: " + L.condition : "", L.title_status ? "Title: " + L.title_status : "",
        typeof L.owner_count === "number" ? "Owners: " + L.owner_count : "", L.has_records === true ? "Service records: yes" : "", "Photos: " + Number(L.photo_count || 0)].filter(Boolean).join(" · "));
      if (L.mods_text) copy.push("Mods: " + L.mods_text);
    } else {
      copy.push("Trade-in: " + yesNo(L.has_trade) + " · Financing: " + yesNo(L.wants_financing));
    }
    if (L.message) copy.push("Message: “" + String(L.message).slice(0, 1500) + "”");
    copy.push("Source: " + (L.source || "direct") + (L.channel ? " (" + L.channel + ")" : ""));
    if (inv && inv.vdp_url) copy.push("Listing: " + inv.vdp_url);

    const notes: string[] = [];
    if (L.classification) notes.push("Classified " + L.classification);
    if (isSell && L.verdict) notes.push("Verdict " + L.verdict + (L.comps_median ? " · US sold median " + money(L.comps_median) + " (n=" + (L.comps_n || 0) + ")" : " · no sold comps"));
    if (isSell && L.desirability_tier) notes.push("Tier " + L.desirability_tier + (L.desirability_why ? ": " + L.desirability_why : ""));
    if (L.missing_info) notes.push("Still need: " + L.missing_info);
    if (L.flag) notes.push("Flag: " + L.flag);
    if (!L.enriched_at && L.status !== "duplicate") notes.push("The AI has not finished with this lead yet" + (L.enrich_error ? " (" + String(L.enrich_error).slice(0, 160) + ")" : "") + ".");

    // One-tap buttons: Text (via TEXT_PAGE_URL), Call (tel:) and Email (mailto:) open the phone's
    // own apps, prefilled with the suggested reply.
    const phone = String(L.phone || "").replace(/[^\d+]/g, "");
    // A first touch that already went out (sent by hand, or by v1.6) is shown as sent, not suggested.
    const alreadySent = !!draft && draft.status === "sent";
    const reply = draft && draft.body && !alreadySent ? String(draft.body) : "";
    const buttons: { label: string; href: string }[] = [];
    if (phone) buttons.push({ label: "Text", href: TEXT_PAGE_URL + "#to=" + encodeURIComponent(phone) + (reply ? "&body=" + encodeURIComponent(reply) : "") });
    if (phone) buttons.push({ label: "Call", href: "tel:" + phone });
    if (L.email) buttons.push({ label: "Email", href: "mailto:" + String(L.email) + "?subject=" + encodeURIComponent(String((draft && draft.subject) || "Your " + (car || "car") + " — TBTFW")) + (reply ? "&body=" + encodeURIComponent(reply) : "") });
    buttons.push({ label: "Open in CRM", href: LEADS_URL || CRM_DEFAULT_URL });

    const esc = (s: unknown) => escapeHtml(String(s ?? ""));
    const cap = "margin:18px 0 6px;font-size:11px;letter-spacing:1px;color:#777;text-transform:uppercase";
    const html =
      "<div style=\"font:15px/1.5 -apple-system,Helvetica,Arial,sans-serif;color:#111;max-width:640px\">" +
      "<p style=\"margin:0 0 4px;font-size:11px;letter-spacing:1px;color:#777;text-transform:uppercase\">New lead " + esc(L.ref) + (label ? " · " + esc(label) : "") + "</p>" +
      "<p style=\"margin:0 0 16px;font-size:17px;font-weight:600\">" + esc(summary) + "</p>" +
      "<table role=\"presentation\" cellspacing=\"0\" cellpadding=\"0\" border=\"0\"><tr>" +
      buttons.map((b) => "<td style=\"padding:0 8px 8px 0\"><a href=\"" + esc(b.href) + "\" style=\"display:inline-block;padding:11px 18px;background:#0a0908;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;border-radius:6px\">" + esc(b.label) + "</a></td>").join("") +
      "</tr></table>" +
      "<p style=\"" + cap + "\">Copy and paste</p>" +
      "<pre style=\"margin:0;padding:12px 14px;background:#f4f4f2;border-radius:6px;font:13px/1.5 Menlo,Consolas,monospace;white-space:pre-wrap\">" + esc(copy.join("\n")) + "</pre>" +
      (notes.length ? "<p style=\"" + cap + "\">AI notes</p><ul style=\"margin:0;padding-left:18px\">" + notes.map((n) => "<li>" + esc(n) + "</li>").join("") + "</ul>" : "") +
      (reply ? "<p style=\"" + cap + "\">Suggested reply (not sent; Text or Email above opens it ready to go)</p>" +
        "<div style=\"padding:12px 14px;border-left:3px solid #0a0908;background:#fafaf8;white-space:pre-wrap\">" + esc((draft.subject ? "Subject: " + draft.subject + "\n\n" : "") + reply) + "</div>" : "") +
      (alreadySent ? "<p style=\"" + cap + "\">Already sent to the customer</p>" +
        "<div style=\"padding:12px 14px;border-left:3px solid #999;background:#fafaf8;white-space:pre-wrap;color:#444\">" + esc((draft.subject ? "Subject: " + draft.subject + "\n\n" : "") + String(draft.body || "")) + "</div>" : "") +
      "<p style=\"margin:20px 0 0;font-size:12px;color:#888\">" + (alreadySent ? "A first reply already went out (shown above)." : "Nothing was sent to the customer.") + "</p></div>";

    const token = await graphAccess();
    const r = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ message: { subject, body: { contentType: "HTML", content: html }, toRecipients: [{ emailAddress: { address: LEAD_EMAIL_TO } }] }, saveToSentItems: false }),
    });
    if (r.status !== 202) throw new Error("Graph sendMail " + r.status + ": " + (await r.text()).slice(0, 200));
    await event(leadId, "lead_emailed", { to: LEAD_EMAIL_TO, label: label || null, has_reply: !!reply, forced: force });
    return "sent";
  }
  async function askModel(system: string, prompt: string, tools: unknown[], toolName: string, maxTokens = 16000, effort = "medium"): Promise<Json> {
    if (!ANTHROPIC_KEY) throw new Error("ANTHROPIC_KEY secret missing");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90000);
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "anthropic-beta": FALLBACK_BETA, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: maxTokens, // covers thinking plus the tool call
          output_config: { effort },
          fallbacks: "default",
          system: system + "\n\nAlways answer by calling the " + toolName + " tool exactly once. Never reply with plain text.",
          tools,
          tool_choice: { type: "auto" }, // forced tool_choice is rejected by this model; strict schema + the line above make the call reliable
          messages: [{ role: "user", content: prompt }],
        }),
        signal: controller.signal,
      });
      if (!r.ok) throw new Error("Anthropic " + r.status + ": " + (await r.text()).slice(0, 400));
      const d = await r.json();
      if (d.stop_reason === "refusal") throw new Error("Anthropic refused (" + String(d.stop_details?.category || "unspecified") + ")");
      if (d.stop_reason === "max_tokens") throw new Error("Anthropic hit max_tokens before the tool call; raise maxTokens");
      const block = (d.content || []).find((b: Json) => b.type === "tool_use");
      if (!block || !block.input) throw new Error("Anthropic returned no tool_use block");
      return block.input as Json;
    } catch (e) {
      if ((e as Error)?.name === "AbortError") throw new Error("timeout after 90000ms calling Anthropic");
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  // ---- voice prompt (portal_kv) ------------------------------------------
  let VOICE = DEFAULT_VOICE;
  try {
    const rows = await sbSelect("portal_kv", "key=eq.voice_prompt&select=value&limit=1");
    const t = rows.length && rows[0].value ? String((rows[0].value as Json).text || "") : "";
    if (t.trim().length > 100) VOICE = t;
  } catch (_e) { /* fallback */ }

  const draftTool = [{
    name: "save_draft",
    description: "Classify the lead and save the draft message plus notes for the salesperson.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        classification: { type: "string", enum: ["BUYER", "SELLER", "JUNK"], description: "BUYER, SELLER, or JUNK (spam, dealers, bots, nonsense, no real car or no real intent)." },
        subject: { type: ["string", "null"], description: "Email subject line. null for a text message or when JUNK." },
        body: { type: "string", description: "The message body, plain text. Empty string when JUNK." },
        missing_info: { type: "string", description: "What we still do not know that matters (VIN, miles, their number, payoff, timeline...). Short, comma-separated. Empty if nothing." },
        flag: { type: "string", description: "One short line Garett must read before sending: NOT IN STOCK (a sourcing deal) when the car they want is not in INVENTORY, which stock number you matched, and any risk, oddity or urgency. Empty if nothing." },
        cars_mentioned: { type: "array", items: { type: "string" }, description: "Stock numbers, exactly as in INVENTORY, of every car the message names, describes or links. Empty if none." },
        request_in_stock: { type: "boolean", description: "true only when the car or cars the customer asked for are in INVENTORY: the model they named or picked, not an alternative you are suggesting. false for sellers, junk, and anything we would source." },
        needs_review: { type: "boolean", description: "true only when the message itself, sent exactly as written, could embarrass us: it repeats a listing detail that looks wrong or garbled, or names a car you are not sure is the one they mean. Things you only note in the flag (a detail you left out, their preferences, an odd email domain) do not count. false when the body is clean and right." },
      },
      required: ["classification", "subject", "body", "missing_info", "flag", "cars_mentioned", "request_in_stock", "needs_review"],
    },
  }];
  const HARD_RULES =
    "HARD RULES (apply to every draft, on top of the voice above; where the two disagree, these win):\n" +
    "- A human (Garett) reviews every draft before it is sent. Write as Garett, first person.\n" +
    "- Every message exists to get the sale: move them one step closer to buying (a call, a visit, holding the car). End on the one easy question that does that.\n" +
    "- Sound like a private client advisor at a Beverly Hills house, never a salesman: calm, specific, understated. No hype or pressure (amazing, incredible, stunning, deal, special, act fast, won't last). Let the car's details do the selling.\n" +
    "- Never name a price, offer, valuation or number about money first. Never mention comps, market or value. Let them name theirs.\n" +
    "- Only use the FACTS and the INVENTORY given. Never invent a detail about a car, the customer or TBTFW.\n" +
    "- A car may be called available, linked or described ONLY if it is in INVENTORY. When the car they want is there, write about that exact car and work in one or two standout details copied exactly from its INVENTORY line (the colour combination, the miles, the engine); never a spec list. Add its listing link when they want photos or details, or when the channel is email. When several INVENTORY cars match what they asked for (say they asked for G-Wagons and two are listed), cover each one in its own line: year, model, colour combination, miles and, in an email, its link. List every INVENTORY car you mention in cars_mentioned.\n" +
    "- When the car they want is NOT in INVENTORY: TBTFW sources anything, so write with complete confidence that we will put them in that car, as if it is routine. Never say or imply it is here, in stock or available today, and never let it sound like we are looking for one: no checking, searching, hunting, tracking down, 'let me see', 'if we can find', 'not in stock', 'sold', 'we don't have', 'unfortunately'. Do not describe a specific example (colour, miles, year) unless the customer gave it. Do not promise a delivery date; if they gave a deadline, acknowledge it and leave the commitment to Garett. It should read as handled: confirm the car, say you will come back to them shortly with the details, and use the question to pin down their spec. Put NOT IN STOCK in the flag.\n" +
    "- Do not pitch other cars unless they asked what else we have or said they are flexible; then only cars from INVENTORY.\n" +
    "- Ask at most ONE question, and never for something the FACTS already have.\n" +
    "- Never say AI, automated, bot or system. No exclamation marks, no emoji, no hashtags.\n" +
    "- TEXT channel: 1 to 4 short sentences, under 320 characters not counting a link, no subject, end with: " + SIGN_OFF + "\n" +
    "- EMAIL channel: a short subject that names the car; a short opening, the car or cars, one closing question; closing line exactly: " + SIGN_OFF + "\n" +
    "- JUNK: classification JUNK, body empty, say why in flag.\n";

  // ---- inventory (v1.5) -----------------------------------------------------
  // What is on tbtfw.com right now. Active, stock and link come from tbtfw_inventory
  // (inventory-sync, hourly); colours, engine, gearbox and photo count come from one
  // fetch of the inventory page, whose hydration data carries them per car. If that
  // fetch fails the drafts still get the table's facts. Loaded once per invocation.
  type Car = { stock_id: string; vdp_url: string; line: string };
  // The promise is kept, not the list, so drafts written in parallel share one load.
  let inventoryLoad: Promise<Car[]> | null = null;
  function inventory(): Promise<Car[]> {
    inventoryLoad ??= loadInventory();
    inventoryLoad.catch(() => (inventoryLoad = null)); // a failed load is retried by the next draft
    return inventoryLoad;
  }
  async function loadInventory(): Promise<Car[]> {
    const [rows, details] = await Promise.all([
      sbSelect("tbtfw_inventory", "active=eq.true&select=stock_id,year,make,model,trim,mileage,color,vdp_url&order=make.asc,model.asc,year.asc&limit=300"),
      listingDetails(),
    ]);
    const has = (x: unknown) => x !== null && x !== undefined && String(x).trim() !== "";
    return rows.map((r) => {
      const d = details[String(r.vdp_url || "").split("/").pop() || ""] || {};
      const ext = d.ext || (has(r.color) ? String(r.color) : "");
      const line = [
        "stock " + r.stock_id,
        [r.year, r.make, r.model, r.trim].filter(has).join(" "),
        ext && d.int ? ext + " over " + d.int : ext,
        has(r.mileage) ? miles(r.mileage) : "",
        d.engine, d.transmission, d.drivetrain,
        d.photos ? d.photos + " photos" : "",
        String(r.vdp_url || ""),
      ].filter(Boolean).join(" | ");
      return { stock_id: String(r.stock_id), vdp_url: String(r.vdp_url || ""), line };
    });
  }
  async function listingDetails(): Promise<Record<string, Record<string, string>>> {
    const out: Record<string, Record<string, string>> = {};
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const r = await fetch(INVENTORY_PAGE, { headers: { "User-Agent": "Mozilla/5.0 (compatible; TBTFW-portal-sync/1.0)", Accept: "text/html" }, signal: controller.signal });
      if (!r.ok) return out;
      const html = await r.text();
      // One object per car, keyed by the 32-hex id that ends its listing URL (same parse as inventory-sync).
      const re = /\{id:"([0-9a-f]{32})",stockNum:"/g;
      const starts: { id: string; pos: number }[] = [];
      let m: RegExpExecArray | null;
      while ((m = re.exec(html)) !== null) starts.push({ id: m[1], pos: m.index });
      for (let i = 0; i < starts.length; i++) {
        const block = html.slice(starts[i].pos, i + 1 < starts.length ? starts[i + 1].pos : starts[i].pos + 40000);
        const f = (k: string) => {
          const x = block.match(new RegExp("[,{]" + k + ':"((?:[^"\\\\]|\\\\.)*)"'));
          return x ? x[1].replace(/\\"/g, '"').replace(/\s+/g, " ").trim() : "";
        };
        const photos = block.match(/[,{]photosCount:(\d+)/);
        out[starts[i].id] = {
          ext: f("extColorFactory") || f("extColor"),
          int: f("intColorFactory") || f("intColor"),
          engine: f("engine"),
          transmission: f("transmission").replace(/Clutc$/, "Clutch"), // the feed cuts this word short
          drivetrain: f("drivetrain"),
          photos: photos && Number(photos[1]) > 1 ? photos[1] : "",
        };
      }
    } catch (_e) { /* the table's facts are enough to draft */ } finally {
      clearTimeout(timer);
    }
    return out;
  }
  // Buyers always see the inventory; a seller only when they want to trade into something.
  function wantsInventory(L: Json): boolean {
    return L.kind !== "sell" || /trade/i.test(String(L.intent || ""));
  }

  // v1.5: code-side checks on a draft. Problems never block it (a person approves every
  // send); they go in front of Garett as a CHECK line at the head of the flag.
  function checkDraft(d: Json, channel: string, cars: Car[]): string[] {
    const text = String(d.body || "");
    const mentioned = d.cars_mentioned as string[];
    const issues: string[] = [];
    const stock = new Set(cars.map((c) => c.stock_id));
    const links = new Set(cars.map((c) => c.vdp_url));
    for (const s of mentioned) if (!stock.has(s)) issues.push("names stock " + s + ", which is not in inventory");
    for (const u of text.match(/https?:\/\/\S+/g) || []) if (!links.has(u.replace(/[).,!?]+$/, ""))) issues.push("has a link that is not an inventory listing");
    if (/\$\s?\d|\b\d+(\.\d+)?\s?(k|grand|mil|million)\b/i.test(text)) issues.push("mentions a money figure");
    if (/\b(let me (check|see|look)|i'?ll (check|look|see)|looking (around|for one)|hunt(ing)?|track(ing)? (one|it) down|if (we|i) can find|not in stock|out of stock|sold out|don'?t have|unfortunately)\b/i.test(text)) issues.push("sounds like we are hunting for the car");
    if (!mentioned.length && /\b(is|are) available\b|\bin stock\b|\bon (our|the) lot\b|\bin (our|the) showroom\b/i.test(text)) issues.push("calls a car available that is not in inventory");
    if (channel === "sms" && text.replace(/https?:\/\/\S+/g, "").trim().length > 320) issues.push("text runs over 320 characters");
    return issues;
  }
  function flagLine(d: Json): string | null {
    const issues = (d.issues as string[]) || [];
    const s = [issues.length ? "CHECK: " + issues.join("; ") : "", String(d.flag || "")].filter(Boolean).join(" // ");
    return s ? s.slice(0, 500) : null;
  }

  // Build the FACTS block for a lead. Marks unknowns explicitly so the draft asks only for those.
  async function leadFacts(L: Json): Promise<string[]> {
    const isSell = L.kind === "sell";
    const f: string[] = [];
    f.push("Lead type from the form: " + (isSell ? "SELL (owner offering their car to TBTFW)" : "BUY (shopper asking about a car in TBTFW inventory)"));
    f.push("Customer: " + (L.full_name || "name unknown") + " // first name to use: " + firstName(L.full_name));
    f.push("Phone: " + (L.phone || "NONE") + " // Email: " + (L.email || "NONE") + " // Preferred contact: " + (L.contact_pref || "not stated") + (L.best_time ? " (" + L.best_time + ")" : ""));
    if (isSell) {
      f.push("Car: " + identityLine(L) + (L.make ? " (" + L.make + ")" : ""));
      f.push("VIN: " + (L.vin ? String(L.vin) + " (KNOWN, do not ask)" : "UNKNOWN"));
      f.push("Current miles: " + (L.mileage !== null && L.mileage !== undefined ? miles(L.mileage) + " (KNOWN, do not ask)" : "UNKNOWN"));
      f.push("Photos received: " + Number(L.photo_count || 0) + (Number(L.photo_count || 0) >= 3 ? " (enough, do not ask for photos)" : Number(L.photo_count || 0) > 0 ? " (a few more would help)" : " (NONE)"));
      f.push("What they want for it: " + (L.asking_price ? "they named a number already (KNOWN, do not ask, do not repeat it)" : "UNKNOWN"));
      f.push("Trade-in interest: " + (L.intent ? String(L.intent) + " (KNOWN)" : "UNKNOWN"));
      const own = L.title_status ? String(L.title_status) : (L.lienholder || L.payoff_estimate ? "has a loan or lease (lienholder on file)" : "");
      f.push("Own outright / loan / lease: " + (own ? own + " (KNOWN)" : "UNKNOWN"));
      if (L.condition) f.push("Stated condition: " + L.condition);
      if (typeof L.owner_count === "number") f.push("Owners: " + L.owner_count);
      if (L.has_records === true) f.push("Has service records");
      if (L.mods_text) f.push("Modifications: " + L.mods_text);
    } else {
      const car = L.stock_id ? (await inventory()).find((c) => c.stock_id === String(L.stock_id)) : undefined;
      if (car) {
        f.push("Car they asked about: IN STOCK, stock " + car.stock_id + " (its INVENTORY line: " + car.line + ")");
      } else if (L.stock_id) {
        f.push("Car they asked about: " + identityLine(L) + " // stock " + L.stock_id + " // that exact car is no longer on the site. Do not call it available; it is a sourcing deal, or an INVENTORY car that matches closely.");
      } else {
        f.push("Car they asked about, in their words: " + (L.wanted_text || "UNKNOWN — ask which car") + " // match it to INVENTORY yourself; if no car there is that model, it is NOT IN STOCK");
      }
      f.push("Has a trade-in: " + (L.has_trade ? "yes" : "not stated") + " // Financing: " + (L.wants_financing ? "interested" : "not stated"));
    }
    if (L.timeline) f.push("Timeline: " + L.timeline);
    if (L.zip) f.push("ZIP: " + L.zip);
    if (L.message) f.push("Their message, verbatim: \"" + String(L.message).slice(0, 800) + "\"");
    return f;
  }

  async function voiceDraft(kind: "first_touch" | "follow_up" | "reply", L: Json, channel: "sms" | "email", extra: string[]): Promise<Json> {
    const facts = await leadFacts(L);
    const task = kind === "first_touch"
      ? "TASK: this is the FIRST message to a new lead. Classify, then write the opener for that classification."
      : kind === "follow_up"
      ? "TASK: this is a FOLLOW-UP to silence. Classification stays what it was. Do not repeat the earlier wording or question; one different, easier question (for a seller: is the car still available; for a buyer: still looking, or want the photos)."
      : "TASK: this is a REPLY to the customer's latest message in the thread below. Answer what they actually asked, in Garett's voice, using only the FACTS. If they asked for photos, give the listing link and say the listing has beautiful, gorgeous photos. If they asked for a price or an offer, do not give one; ask what they are looking to get, or move them to a call. Classification stays what it was.";
    const cars = wantsInventory(L) ? await inventory() : [];
    const stock = cars.length
      ? "INVENTORY (on tbtfw.com right now; the only cars that can be called available, linked or described):\n- " + cars.map((c) => c.line).join("\n- ")
      : "";
    const prompt =
      task + "\n\nCHANNEL: " + (channel === "sms" ? "TEXT" : "EMAIL") + "\n\nFACTS:\n- " + facts.join("\n- ") + (stock ? "\n\n" + stock : "") + (extra.length ? "\n\n" + extra.join("\n\n") : "") + "\n\n" + HARD_RULES + "\nPass the result to the save_draft tool.";
    const out = await askModel(VOICE, prompt, draftTool, "save_draft", 16000, EFFORT[kind]);
    const d: Json = {
      classification: ["BUYER", "SELLER", "JUNK"].includes(String(out.classification)) ? String(out.classification) : (L.kind === "sell" ? "SELLER" : "BUYER"),
      subject: channel === "email" && out.subject ? String(out.subject).trim().slice(0, 200) : null,
      body: String(out.body || "").trim(),
      missing_info: String(out.missing_info || "").trim().slice(0, 500),
      flag: String(out.flag || "").trim().slice(0, 500),
      cars_mentioned: Array.isArray(out.cars_mentioned) ? (out.cars_mentioned as unknown[]).map((x) => String(x).replace(/^stock\s+/i, "").trim()).filter(Boolean) : [],
      request_in_stock: out.request_in_stock === true,
      needs_review: out.needs_review !== false,
    };
    d.issues = d.classification === "JUNK" ? [] : checkDraft(d, channel, cars);
    return d;
  }

  // v1.6: the first answer to a lead. A buyer with an email is written to by email first; if
  // that draft is clean and the car is in stock it goes out on its own (see v1.6 above).
  // Otherwise it is a draft for approval on the usual channel: text when there is a phone and
  // no stated email preference, which takes a second call, since that version was an email.
  async function firstTouch(L: Json): Promise<{ d: Json; channel: "sms" | "email"; auto: boolean }> {
    const channel = pickChannel(L);
    if (AUTO_SEND && L.kind !== "sell" && /\S+@\S+\.\S+/.test(String(L.email || ""))) {
      const d = await voiceDraft("first_touch", L, "email", [
        "IF THE CAR THEY ASKED FOR IS IN INVENTORY, this email goes to the customer with no one reviewing it: it must be complete, exact and ready to send.",
      ]);
      const auto = d.classification === "BUYER" && d.request_in_stock === true && d.needs_review === false &&
        (d.cars_mentioned as string[]).length > 0 && !(d.issues as string[]).length && !!String(d.body || "").trim() && !!d.subject;
      // Not sent by itself: the email stays the draft when they have no phone or said they prefer email.
      if (auto || d.classification === "JUNK" || channel === "email" || /mail/i.test(String(L.contact_pref || ""))) return { d, channel: "email", auto };
    }
    return { d: await voiceDraft("first_touch", L, channel, []), channel, auto: false };
  }

  // The context a follow-up draft gets: what we sent last, and which stage this is.
  function followExtra(L: Json, lastOut: Json, days: number, stage: number): string[] {
    return [
      "OUR PREVIOUS MESSAGE (sent " + Math.floor(days) + " days ago, no reply, " + (lastOut.purpose || "message") + "):\n\"\"\"\n" + String(lastOut.body || "").slice(0, 1500) + "\n\"\"\"",
      "FOLLOW-UP STAGE: " + stage + " of " + FOLLOW_UP_MAX + (stage >= FOLLOW_UP_MAX ? " (the last one: easy to say no, door open, no pressure, then we stop)" : " (a light nudge)"),
      L.classification ? "CLASSIFICATION: " + L.classification : "",
    ].filter(Boolean);
  }
  // The context a reply draft gets: the thread, and whether this is rapid back-and-forth.
  function replyContext(L: Json, msgs: Json[]): { extra: string[]; rapid: boolean; channel: "sms" | "email"; last: Json } {
    const last = msgs[msgs.length - 1];
    const lastOut = [...msgs].reverse().find((m) => m.direction === "out" && m.status === "sent");
    const gapMin = lastOut ? (new Date(String(last.sent_at || last.created_at)).getTime() - new Date(String(lastOut.sent_at)).getTime()) / 60000 : 1e9;
    const rapid = gapMin < RAPID_MINUTES;
    const channel = String(last.channel || "") === "sms" ? "sms" : (String(last.channel || "") === "email" ? "email" : pickChannel(L));
    const thread = msgs.slice(-8).map((m) => (m.direction === "in" ? "CUSTOMER" : "GARETT") + " (" + String(m.sent_at || m.created_at).slice(0, 16).replace("T", " ") + "):\n" + String(m.body || "").slice(0, 900)).join("\n\n");
    const extra = [
      "THREAD (oldest first):\n\"\"\"\n" + thread + "\n\"\"\"",
      rapid ? "PACE: rapid back-and-forth (their reply came " + Math.round(gapMin) + " minutes after ours). Drop the greeting; answer directly." : "PACE: normal; a short greeting is fine.",
      L.classification ? "CLASSIFICATION: " + L.classification : "",
    ].filter(Boolean);
    return { extra, rapid, channel, last };
  }

  // ---- PURGE: delete Storage objects under leads/{id}/ -------------------
  if (Array.isArray(body.purge_lead_ids)) {
    const out: Json[] = [];
    for (const raw of body.purge_lead_ids as unknown[]) {
      const id = String(raw || "").trim();
      if (!/^[0-9a-fA-F-]{36}$/.test(id)) { out.push({ id, error: "bad id" }); continue; }
      try {
        const objs = await listObjects("leads/" + id);
        const prefixes = objs.map((o) => "leads/" + id + "/" + String(o.name));
        let deleted = 0;
        if (prefixes.length) {
          const r = await fetch(STORAGE + "/object/" + BUCKET, { method: "DELETE", headers: SB, body: JSON.stringify({ prefixes }) });
          if (!r.ok) throw new Error("delete " + r.status + ": " + (await r.text()));
          const d = await r.json();
          deleted = Array.isArray(d) ? d.length : prefixes.length;
        }
        const after = await listObjects("leads/" + id);
        out.push({ id, found: prefixes.length, deleted, remaining: after.length });
      } catch (e) {
        out.push({ id, error: String((e as Error).message || e) });
      }
    }
    return json({ ok: true, purged: out });
  }

  const report: Json = { auto_sent: [] as Json[], lead_emails: [] as Json[], fallback_pushes: 0, orphan_pushes: 0, stuck_completed: 0, follow_ups: [] as Json[], replies: [] as Json[], enriched: [], errors: [] as string[] };
  const errors = report.errors as string[];
  const isId = (v: unknown) => typeof v === "string" && /^[0-9a-fA-F-]{36}$/.test(String(v).trim());
  const forceOne = isId(body.lead_id) ? String(body.lead_id).trim() : null;
  const forcePush = body.force_push === true;
  const followOne = isId(body.follow_up_lead_id) ? String(body.follow_up_lead_id).trim() : null;
  const replyOne = isId(body.reply_lead_id) ? String(body.reply_lead_id).trim() : null;
  const sweepsOn = !forceOne && !followOne && !replyOne;

  // v1.7 maintenance: {"lead_email_lead_id": "..."} emails one lead to Garett now ("force": true resends).
  if (isId(body.lead_email_lead_id) && !PREVIEW_ONLY) {
    try {
      return json({ ok: true, v: "1.7", lead_email: await leadEmail(String(body.lead_email_lead_id).trim(), body.force === true) });
    } catch (e) {
      return json({ ok: false, v: "1.7", error: String((e as Error).message || e) }, 502);
    }
  }

  // ---- PREVIEW (v1.5): draft without writing anything but a lead_events row ----------
  // Body {"preview_lead_ids": [...], "preview_kind"?: "first_touch" | "follow_up" | "reply"}.
  // The kind defaults to what the sweeps would write next for that lead. On the preview slug,
  // "preview_leads": [{...lead fields, messages: [...]}] drafts for made-up test leads that
  // never touch the leads table. Each draft lands in lead_events as 'draft_preview'; the
  // response carries refs and timings, never the text.
  const previewLeads = PREVIEW_ONLY && Array.isArray(body.preview_leads) ? body.preview_leads as Json[] : [];
  if (Array.isArray(body.preview_lead_ids) || previewLeads.length) {
    const jobs: { id: string | null; get: () => Promise<[Json, Json[]]> }[] = [];
    for (const raw of Array.isArray(body.preview_lead_ids) ? body.preview_lead_ids as unknown[] : []) {
      const id = String(raw || "").trim();
      jobs.push({
        id,
        get: async () => {
          if (!isId(id)) throw new Error("bad id");
          const rows = await sbSelect("leads", "id=eq." + id + "&select=*&limit=1");
          if (!rows.length) throw new Error("no such lead");
          const msgs = await sbSelect("lead_messages", "lead_id=eq." + id + "&status=in.(sent,received)&select=direction,purpose,status,channel,to_address,subject,body,sent_at,created_at&order=created_at.asc&limit=40");
          return [rows[0], msgs];
        },
      });
    }
    for (const t of previewLeads) jobs.push({ id: null, get: async () => [t, Array.isArray(t.messages) ? t.messages as Json[] : []] });
    // In parallel: each draft is one model call of up to a minute, and five in a row would outrun the function.
    const out = await Promise.all(jobs.slice(0, PREVIEW_MAX).map(async (job): Promise<Json> => {
      const id = job.id;
      const t0 = Date.now();
      try {
        const [L, msgs] = await job.get();
        const sent = msgs.filter((m) => m.direction === "out" && m.status === "sent" && m.sent_at);
        const lastOut = sent.length ? sent[sent.length - 1] : null;
        const asked = String(body.preview_kind || "");
        const kind = (["first_touch", "follow_up", "reply"].includes(asked) ? asked
          : msgs.length && msgs[msgs.length - 1].direction === "in" ? "reply" : lastOut ? "follow_up" : "first_touch") as "first_touch" | "follow_up" | "reply";
        if (kind === "reply" && !msgs.some((m) => m.direction === "in")) throw new Error("no customer message to reply to");
        if (kind === "follow_up" && !lastOut) throw new Error("nothing sent yet to follow up on");
        let channel: "sms" | "email" = pickChannel(L);
        let extra: string[] = [];
        let auto = false;
        let d: Json;
        if (kind === "first_touch") {
          ({ d, channel, auto } = await firstTouch(L));
        } else {
          if (kind === "reply") ({ extra, channel } = replyContext(L, msgs));
          if (kind === "follow_up" && lastOut) {
            const stage = Math.min(FOLLOW_UP_MAX, sent.filter((m) => m.purpose === "follow_up").length + 1);
            channel = String(lastOut.channel || "") === "sms" ? "sms" : "email";
            extra = followExtra(L, lastOut, (Date.now() - new Date(String(lastOut.sent_at)).getTime()) / 86400000, stage);
          }
          d = await voiceDraft(kind, L, channel, extra);
        }
        await event(id, "draft_preview", { ref: L.ref, kind, channel, auto, ...d, ms: Date.now() - t0 });
        return { ref: L.ref, kind, channel, auto, chars: String(d.body).length, issues: (d.issues as string[]).length, ms: Date.now() - t0 };
      } catch (e) {
        return { id, error: String((e as Error).message || e), ms: Date.now() - t0 };
      }
    }));
    return json({ ok: true, v: "1.7", previews: out });
  }

  // ---- SWEEP F (v1.6): send the auto-emails that are due --------------------
  // First, so a slow draft further down never holds one back. lead-crm does the send: it
  // claims the row (a Cancel from the queue in the same instant wins or loses cleanly) and,
  // when Graph fails, puts it back in the queue as a draft with the error.
  if (sweepsOn) {
    try {
      const due = await sbSelect("lead_messages", "status=eq.approved&approved_at=lte." + encodeURIComponent(new Date().toISOString()) + "&select=id,lead_id&order=approved_at.asc&limit=5");
      for (const m of due) {
        const r = await fetch(FUNCTIONS + "/lead-crm/message/" + m.id + "/send", { method: "POST", headers: SB, body: "{}" });
        const d = await r.json().catch(() => ({}));
        (report.auto_sent as Json[]).push({ message_id: m.id, ok: !!d.ok, ...(d.ok ? {} : { error: String(d.message || "HTTP " + r.status) }) });
        if (!d.ok) errors.push("auto_send " + m.id + ": " + String(d.message || "HTTP " + r.status));
      }
    } catch (e) { errors.push("auto_send: " + String((e as Error).message || e)); }
  }

  // ---- SWEEP G (v1.7): email Garett about any lead he has not had an email for ------------
  // Normally the email follows enrichment; this catches the rest after the fallback delay:
  // duplicates (never enriched), leads the AI is stuck on or gave up, and a failed send.
  if (sweepsOn) {
    try {
      const cutoff = new Date(Date.now() - LEAD_EMAIL_FALLBACK_MINUTES * 60000).toISOString();
      const since = new Date(Date.now() - 3 * 86400000).toISOString();
      const ready = await sbSelect("leads", "ready_at=lte." + encodeURIComponent(cutoff) + "&created_at=gte." + encodeURIComponent(since) + "&select=id,ref&order=ready_at.desc&limit=100");
      if (ready.length) {
        const sent = await sbSelect("lead_events", "event=eq.lead_emailed&created_at=gte." + encodeURIComponent(since) + "&select=lead_id&limit=1000");
        const done = new Set(sent.map((e) => String(e.lead_id)));
        for (const l of ready.filter((x) => !done.has(String(x.id))).slice(0, 5)) {
          try {
            (report.lead_emails as Json[]).push({ ref: l.ref, result: await leadEmail(String(l.id)) });
          } catch (e) {
            errors.push(String(l.ref) + " lead_email: " + String((e as Error).message || e));
          }
        }
      }
    } catch (e) { errors.push("lead_emails: " + String((e as Error).message || e)); }
  }

  // ---- SWEEP A: five-minute fallback push (plain format) -----------------
  if (sweepsOn) {
    try {
      const since = new Date(Date.now() - FALLBACK_MINUTES * 60000).toISOString();
      const rows = await sbSelect("leads", "kind=eq.sell&alerted_at=is.null&ready_at=lte." + encodeURIComponent(since) + "&status=not.in.(duplicate,junk)&select=*&order=ready_at.asc&limit=10");
      for (const l of rows) {
        const id = String(l.id);
        const car = identityLine(l) + " // " + miles(l.mileage) + " // asking " + money(l.asking_price);
        const lines = [
          "VIN " + l.vin + " // " + (l.photo_count || 0) + " photos // " + l.full_name,
          l.intent ? String(l.intent) : "",
          l.phone + " // " + l.email + (l.zip ? " // " + l.zip : ""),
          "Enrichment pending // Ref " + l.ref + " // " + l.source + " // " + l.channel,
        ].filter(Boolean);
        const sent = await push(id, "push_fallback", "SELL // " + car, lines.join("\n"));
        if (sent) {
          await sbPatch("leads", "id=eq." + id, { alerted_at: new Date().toISOString() });
          (report.fallback_pushes as number)++;
        }
      }
    } catch (e) { errors.push("fallback: " + String((e as Error).message || e)); }

    // ---- SWEEP B: orphaned trade (buy half with no sell partner) ------------
    try {
      const since = new Date(Date.now() - ORPHAN_MINUTES * 60000).toISOString();
      const rows = await sbSelect("leads", "kind=eq.buy&has_trade=eq.true&alerted_at=is.null&created_at=lte." + encodeURIComponent(since) + "&select=*&order=created_at.asc&limit=10");
      for (const l of rows) {
        const id = String(l.id);
        let partner: Json[] = [];
        if (l.trade_group_id) partner = await sbSelect("leads", "trade_group_id=eq." + l.trade_group_id + "&kind=eq.sell&select=id&limit=1");
        if (partner.length) continue;
        const car = l.stock_id ? identityLine(l) + " // stock " + l.stock_id : "Wanted: " + (l.wanted_text || "");
        const lines = [
          "Trade-in never arrived (" + ORPHAN_MINUTES + " min) — buyer said they have a trade",
          (l.timeline ? String(l.timeline) : "no timeline") + (l.wants_financing ? " // financing" : ""),
          l.phone + " // " + l.email + (l.zip ? " // " + l.zip : ""),
          l.message ? String(l.message).slice(0, 300) : "",
          "Ref " + l.ref + " // " + l.source + " // " + l.channel,
        ].filter(Boolean);
        const sent = await push(id, "push_orphan_trade", "BUY // " + car + " // " + l.full_name, lines.join("\n"));
        if (sent) {
          await sbPatch("leads", "id=eq." + id, { alerted_at: new Date().toISOString() });
          (report.orphan_pushes as number)++;
        }
      }
    } catch (e) { errors.push("orphan: " + String((e as Error).message || e)); }

    // ---- SWEEP C: stuck uploads (objects in Storage, no ready_at) ----------
    try {
      const since = new Date(Date.now() - STUCK_MINUTES * 60000).toISOString();
      const floor = new Date(Date.now() - STUCK_MAX_HOURS * 3600000).toISOString();
      const rows = await sbSelect("leads", "kind=eq.sell&ready_at=is.null&created_at=lte." + encodeURIComponent(since) + "&created_at=gte." + encodeURIComponent(floor) + "&select=id,ref&order=created_at.asc&limit=10");
      for (const l of rows) {
        const id = String(l.id);
        const objs = await listObjects("leads/" + id);
        const photos = objs.filter((o) => !String(o.name || "").startsWith("record_"));
        if (photos.length === 0) continue;
        const r = await fetch(FUNCTIONS + "/lead-intake/lead/" + id + "/complete", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
        const ok = r.ok;
        const txt = (await r.text()).slice(0, 300);
        await event(id, "stuck_upload_completed", { objects: objs.length, status: r.status, ok, response: txt });
        if (ok) (report.stuck_completed as number)++;
      }
    } catch (e) { errors.push("stuck: " + String((e as Error).message || e)); }
  }

  // ---- SWEEP D (v1.2): follow-up drafts into the approval queue ----------
  if (sweepsOn || followOne) {
    try {
      const candidates = followOne
        ? await sbSelect("leads", "id=eq." + followOne + "&select=*&limit=1")
        : await sbSelect("leads", "status=eq.contacted&select=*&order=updated_at.asc&limit=25");
      let drafted = 0;
      for (const L of candidates) {
        if (drafted >= FOLLOW_UP_BATCH) break;
        if (Date.now() - startedAt > 80000) break;
        const id = String(L.id);
        const fu: Json = { ref: L.ref };
        try {
          const msgs = await sbSelect("lead_messages", "lead_id=eq." + id + "&select=id,direction,purpose,status,channel,to_address,subject,body,sent_at,created_at&order=created_at.desc&limit=50");
          const outs = msgs.filter((m) => m.direction === "out");
          if (outs.some((m) => m.status === "draft")) { fu.skip = "draft already waiting"; continue; }
          const sentOuts = outs.filter((m) => m.status === "sent" && m.sent_at);
          if (!sentOuts.length) { fu.skip = "nothing sent yet"; continue; }
          const lastOut = sentOuts.reduce((a, b) => (String(a.sent_at) > String(b.sent_at) ? a : b));
          const lastOutAt = new Date(String(lastOut.sent_at)).getTime();
          const ins = msgs.filter((m) => m.direction === "in");
          const lastInAt = ins.length ? Math.max(...ins.map((m) => new Date(String(m.sent_at || m.created_at)).getTime())) : 0;
          if (lastInAt > lastOutAt) { fu.skip = "customer replied"; continue; }
          const stageDone = outs.filter((m) => m.purpose === "follow_up" && ["sent", "skipped"].includes(String(m.status))).length;
          if (stageDone >= FOLLOW_UP_MAX) { fu.skip = "all stages done"; continue; }
          const stage = stageDone + 1;
          const days = (Date.now() - lastOutAt) / 86400000;
          const need = FOLLOW_UP_DAYS[Math.min(stageDone, FOLLOW_UP_DAYS.length - 1)];
          if (days < need) { fu.skip = "not due (" + days.toFixed(1) + "d of " + need + ")"; continue; }

          const channel = String(lastOut.channel || "") === "sms" ? "sms" : "email";
          const d = await voiceDraft("follow_up", L, channel, followExtra(L, lastOut, days, stage));
          if (!d.body) throw new Error("empty follow-up draft");
          const row = await sbInsert("lead_messages", {
            lead_id: id, direction: "out", channel, purpose: "follow_up",
            to_address: lastOut.to_address || (channel === "sms" ? L.phone : L.email), subject: d.subject, body: d.body, status: "draft",
          });
          await sbPatch("leads", "id=eq." + id, { missing_info: d.missing_info || null, flag: flagLine(d), updated_at: new Date().toISOString() });
          await event(id, "draft_created", { channel, purpose: "follow_up", stage, chars: String(d.body).length, after_days: Number(days.toFixed(1)), cars: d.cars_mentioned, issues: d.issues });
          await push(id, "push_follow_up", "FOLLOW-UP // " + stage + "/" + FOLLOW_UP_MAX + " // " + identityLine(L) + (L.kind === "sell" ? " // " + miles(L.mileage) : ""),
            ["No reply in " + Math.floor(days) + " days to our " + (lastOut.purpose || "message"), "Draft waiting for your approval (" + channel + ")", String(L.full_name || "") + " // Ref " + L.ref].join("\n"), 0);
          fu.drafted = { message_id: row.id, stage, channel, after_days: Number(days.toFixed(1)), chars: String(d.body).length };
          drafted++;
        } catch (e) {
          fu.error = String((e as Error).message || e);
          errors.push(String(L.ref) + " follow_up: " + fu.error);
        } finally {
          if (followOne || fu.drafted || fu.error) (report.follow_ups as Json[]).push(fu);
        }
      }
    } catch (e) { errors.push("follow_up: " + String((e as Error).message || e)); }
  }

  // ---- SWEEP E (v1.3): reply drafts for leads whose newest message is inbound
  if (sweepsOn || replyOne) {
    try {
      let candidates: Json[] = [];
      if (replyOne) {
        candidates = await sbSelect("leads", "id=eq." + replyOne + "&select=*&limit=1");
      } else {
        const recent = await sbSelect("lead_messages", "direction=eq.in&status=eq.received&created_at=gte." + encodeURIComponent(new Date(Date.now() - 7 * 86400000).toISOString()) + "&select=lead_id&order=created_at.desc&limit=100");
        const ids = Array.from(new Set(recent.map((m) => String(m.lead_id))));
        if (ids.length) candidates = await sbSelect("leads", "id=in.(" + ids.join(",") + ")&status=not.in.(junk,duplicate)&select=*&limit=25");
      }
      let drafted = 0;
      for (const L of candidates) {
        if (drafted >= REPLY_BATCH) break;
        if (Date.now() - startedAt > 100000) break;
        const id = String(L.id);
        const rp: Json = { ref: L.ref };
        try {
          const msgs = await sbSelect("lead_messages", "lead_id=eq." + id + "&status=in.(sent,received,draft)&select=id,direction,purpose,status,channel,to_address,subject,body,sent_at,created_at&order=created_at.asc&limit=40");
          if (msgs.some((m) => m.direction === "out" && m.status === "draft")) { rp.skip = "draft already waiting"; continue; }
          const last = msgs.length ? msgs[msgs.length - 1] : null;
          if (!last || last.direction !== "in") { rp.skip = "newest message is ours"; continue; }
          const { extra, rapid, channel } = replyContext(L, msgs);
          const d = await voiceDraft("reply", L, channel, extra);
          if (!d.body) throw new Error("empty reply draft");
          const row = await sbInsert("lead_messages", {
            lead_id: id, direction: "out", channel, purpose: "reply",
            to_address: channel === "sms" ? L.phone : (last.channel === "email" ? last.to_address : L.email), subject: d.subject || (last.subject ? (/^re:/i.test(String(last.subject)) ? String(last.subject) : "Re: " + last.subject) : null),
            body: d.body, status: "draft", thread_id: null,
          });
          const patch: Json = { missing_info: d.missing_info || null, flag: flagLine(d), updated_at: new Date().toISOString() };
          if (["new", "contacted"].includes(String(L.status))) patch.status = "replied";
          await sbPatch("leads", "id=eq." + id, patch);
          await event(id, "draft_created", { channel, purpose: "reply", rapid, chars: String(d.body).length, cars: d.cars_mentioned, issues: d.issues });
          await push(id, "push_reply_draft", "REPLY DRAFT // " + identityLine(L) + (L.kind === "sell" ? " // " + miles(L.mileage) : ""),
            [String(last.body || "").split("\n").map((s) => s.trim()).filter(Boolean)[0]?.slice(0, 200) || "(no text)", "Reply drafted, waiting for your approval (" + channel + ")", String(L.full_name || "") + " // Ref " + L.ref].join("\n"), 0);
          rp.drafted = { message_id: row.id, channel, rapid, chars: String(d.body).length };
          drafted++;
        } catch (e) {
          rp.error = String((e as Error).message || e);
          errors.push(String(L.ref) + " reply: " + rp.error);
        } finally {
          if (replyOne || rp.drafted || rp.error) (report.replies as Json[]).push(rp);
        }
      }
    } catch (e) { errors.push("reply: " + String((e as Error).message || e)); }
  }
  if (followOne || replyOne) { report.ms = Date.now() - startedAt; return json({ ok: true, v: "1.7", ...report }); }

  // ---- ENRICHMENT ----------------------------------------------------------
  let leads: Json[] = [];
  try {
    if (forceOne) {
      leads = await sbSelect("leads", "id=eq." + forceOne + "&select=*&limit=1");
    } else {
      leads = await sbSelect("leads", "ready_at=not.is.null&enriched_at=is.null&status=not.in.(duplicate,junk)&enrich_attempts=lt." + MAX_ATTEMPTS + "&select=*&order=ready_at.asc&limit=" + ENRICH_BATCH);
    }
  } catch (e) { errors.push("select: " + String((e as Error).message || e)); }

  for (const lead of leads) {
    const id = String(lead.id);
    const ref = String(lead.ref);
    const res: Json = { ref, kind: lead.kind };
    const modelErrors: string[] = [];
    if (Date.now() - startedAt > 110000) { res.skipped = "wall clock"; (report.enriched as Json[]).push(res); break; }
    try {
      let L: Json = lead;
      const isSell = lead.kind === "sell";

      // 1. Canonical identity (sell): vPIC split -> board form.
      if (isSell) {
        const rawModel = String(L.model || "").trim();
        const trimNorm = normalizeTrim(L.trim);
        const ident = canonicalizeIdentity(L.make, rawModel, trimNorm);
        res.canon = { model: ident.model, trim: ident.trim, changed: ident.model !== rawModel || ident.trim !== (L.trim ?? null) };
        L = (await sbPatch("leads", "id=eq." + id, { canon_model: ident.model, canon_trim: ident.trim })) || L;

        // 2. Desirability + specs via spec-inference lead mode (Haiku).
        try {
          const r = await fetch(FUNCTIONS + "/spec-inference", { method: "POST", headers: SB, body: JSON.stringify({ lead_id: id }) });
          const d = await r.json().catch(() => ({}));
          const first = d && Array.isArray(d.results) && d.results.length ? d.results[0] : null;
          if (!r.ok || !d.ok) throw new Error("spec-inference " + r.status + " " + JSON.stringify(d).slice(0, 300));
          if (first && first.error) throw new Error(String(first.error).slice(0, 300));
          res.desirability = first ? { tier: first.desirability_tier, why: first.desirability_why, specs: first.detected_specs } : null;
        } catch (e) {
          modelErrors.push("spec-inference: " + String((e as Error).message || e));
        }
        const fresh = await sbSelect("leads", "id=eq." + id + "&select=*&limit=1");
        if (fresh.length) L = fresh[0];

        // 3. Verdict via the board's engine (pure function).
        const rpc = await fetch(REST + "/rpc/score_identity", {
          method: "POST",
          headers: SB,
          body: JSON.stringify({
            p_make: L.make, p_model: L.canon_model || L.model, p_trim: L.canon_trim || null, p_year: L.year,
            p_mileage: L.mileage, p_price: L.asking_price, p_detected_specs: L.detected_specs || [],
            p_unmatched_tokens: L.unmatched_tokens || null, p_desirability_tier: L.desirability_tier || null,
            p_title: [L.year, L.make, L.canon_model || L.model, L.canon_trim || L.trim].filter(Boolean).join(" "),
          }),
        });
        if (!rpc.ok) throw new Error("score_identity " + rpc.status + ": " + (await rpc.text()).slice(0, 300));
        const rows = await rpc.json();
        const s = Array.isArray(rows) && rows.length ? rows[0] : null;
        if (!s) throw new Error("score_identity returned no row");
        res.score = { verdict: s.verdict, score: s.score, comps_n: s.baseline_n, comps_median: s.baseline_median };
        L = (await sbPatch("leads", "id=eq." + id, {
          comps_median: s.baseline_median, comps_n: s.baseline_n, verdict: s.verdict,
          verdict_score: s.score, verdict_reasoning: s.reasoning,
        })) || L;
      }

      // 4. Voice draft: classify + first touch -> lead_messages DRAFT, an in-stock auto-email
      //    (status approved, sent by SWEEP F when due), or JUNK.
      let channel = pickChannel(L);
      let junk = false;
      let autoQueued = false;
      const alreadyDrafted = await sbSelect("lead_messages", "lead_id=eq." + id + "&purpose=eq.first_touch&select=id&limit=1");
      if (alreadyDrafted.length === 0 && !L.classification) {
        try {
          const plan = await firstTouch(L);
          const d = plan.d;
          channel = plan.channel;
          const patch: Json = { classification: d.classification, missing_info: d.missing_info || null, flag: flagLine(d) };
          if (d.classification === "JUNK") {
            junk = true;
            patch.status = "junk";
            await sbPatch("leads", "id=eq." + id, patch);
            await event(id, "classified_junk", { flag: d.flag, missing_info: d.missing_info });
            res.draft = "junk (no message)";
          } else {
            if (!d.body) throw new Error("empty draft");
            const sendAt = plan.auto ? new Date(Date.now() + AUTO_SEND_MINUTES * 60000).toISOString() : null;
            await sbInsert("lead_messages", {
              lead_id: id, direction: "out", channel, purpose: "first_touch",
              to_address: channel === "sms" ? L.phone : L.email, subject: d.subject, body: d.body,
              status: plan.auto ? "approved" : "draft", approved_at: sendAt,
            });
            patch.first_touch_draft = (d.subject ? "Subject: " + d.subject + "\n\n" : "") + d.body;
            L = (await sbPatch("leads", "id=eq." + id, patch)) || L;
            await event(id, "draft_created", { channel, purpose: "first_touch", classification: d.classification, chars: String(d.body).length, cars: d.cars_mentioned, issues: d.issues, auto: plan.auto, send_at: sendAt });
            res.draft = { channel, classification: d.classification, subject: d.subject, chars: String(d.body).length, flag: flagLine(d), missing_info: d.missing_info || null, auto: plan.auto };
            if (plan.auto) {
              autoQueued = true;
              await push(id, "push_auto_email", "AUTO-EMAIL // " + (L.stock_id ? identityLine(L) : String(L.wanted_text || identityLine(L))) + " // " + String(L.full_name || ""),
                ["Goes out in " + AUTO_SEND_MINUTES + " min unless you cancel it in the queue", String(d.subject || ""), "To " + L.email + " // Ref " + ref].join("\n"), 0);
            }
          }
        } catch (e) {
          modelErrors.push("draft: " + String((e as Error).message || e));
        }
      } else {
        res.draft = "exists";
      }

      // 5. Auto-reply (Resend) — once per lead, only when the key is set; never for junk, and
      //    not when the real answer is already queued to go out by itself.
      if (AUTO_SEND && !junk && !autoQueued && RESEND_API_KEY && L.email) {
        const already = await sbSelect("lead_messages", "lead_id=eq." + id + "&purpose=eq.auto_reply&status=eq.sent&select=id&limit=1");
        if (already.length === 0) {
          const name = firstName(L.full_name);
          const carLine = isSell ? identityLine(L) + " with " + miles(L.mileage) : (L.stock_id ? identityLine(L) + " (stock " + L.stock_id + ")" : "the car you described");
          const subject = isSell ? "We have your " + identityLine(L) + " — TBTFW" : "Your inquiry on the " + identityLine(L) + " — TBTFW";
          const text = "Hi " + name + ",\n\n" +
            (isSell
              ? "Your " + carLine + " came through" + (Number(L.photo_count || 0) > 0 ? " with " + L.photo_count + " photos" : "") + ". A salesperson will respond within the hour."
              : "Your inquiry on " + carLine + " came through. A salesperson will respond within the hour.") +
            "\n\nReply to this email if anything changes in the meantime.\n\n" + SIGN_OFF + "\nTBTFW // Beverly Hills\nReference " + ref;
          const html = "<p>" + escapeHtml(text).replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br>") + "</p>";
          try {
            const r = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: { Authorization: "Bearer " + RESEND_API_KEY, "Content-Type": "application/json" },
              body: JSON.stringify({ from: RESEND_FROM, to: [L.email], subject, text, html }),
            });
            const d = await r.json().catch(() => ({}));
            if (!r.ok || !d.id) throw new Error("Resend " + r.status + " " + JSON.stringify(d).slice(0, 300));
            await sbInsert("lead_messages", {
              lead_id: id, direction: "out", channel: "email", purpose: "auto_reply", to_address: L.email, subject, body: text,
              status: "sent", provider: "resend", provider_id: String(d.id), sent_at: new Date().toISOString(),
            });
            await event(id, "auto_reply_sent", { provider_id: d.id, to: L.email });
            res.auto_reply = "sent";
          } catch (e) {
            await sbInsert("lead_messages", {
              lead_id: id, direction: "out", channel: "email", purpose: "auto_reply", to_address: L.email, subject, body: text,
              status: "failed", provider: "resend", error: String((e as Error).message || e).slice(0, 500),
            });
            res.auto_reply = "failed";
            errors.push(ref + " auto_reply: " + String((e as Error).message || e));
          }
        } else {
          res.auto_reply = "exists";
        }
      } else {
        res.auto_reply = junk ? "junk" : autoQueued ? "auto-email queued" : (AUTO_SEND && RESEND_API_KEY ? "no email" : "off");
      }

      // 6. Enriched push (sell) — when nobody has been alerted yet, or forced; never for junk.
      if (!junk && isSell && (!L.alerted_at || forcePush) && !(await hasEvent(id, "push_enriched"))) {
        const verdict = String(L.verdict || "n/a");
        const asking = Number(L.asking_price);
        const med = L.comps_median !== null && L.comps_median !== undefined ? Number(L.comps_median) : null;
        const n = Number(L.comps_n || 0);
        const delta = (med && asking) ? Math.round(((asking - med) / med) * 100) : null;
        const title = "SELL // " + verdict + " // " + identityLine(L) + " // " + miles(L.mileage);
        const lines = [
          "Asking " + money(asking) + (med ? " // US sold median " + money(med) + " (n=" + n + ")" + (delta !== null ? " // " + (delta >= 0 ? "+" : "") + delta + "%" : "") : " // no sold comps (n=0)"),
          L.desirability_tier ? "Tier " + L.desirability_tier + ": " + String(L.desirability_why || "").slice(0, 200) : "Tier: not graded" + (modelErrors.length ? " (grader unavailable)" : ""),
          "VIN " + L.vin + " // " + (L.photo_count || 0) + " photos // " + L.full_name + (L.intent ? " // " + L.intent : ""),
          L.phone + " // " + L.email + (L.zip ? " // " + L.zip : ""),
          (L.flag ? "Flag: " + String(L.flag).slice(0, 120) + " // " : "") + (res.draft && res.draft !== "exists" ? "Draft ready (" + channel + ") // " : "") + "Ref " + ref + " // " + L.source + " // " + L.channel,
        ];
        const sent = await push(id, "push_enriched", title, lines.join("\n"), verdict === "CHASE" ? 1 : 0);
        if (sent) {
          await sbPatch("leads", "id=eq." + id, { alerted_at: new Date().toISOString() });
          res.push = "sent" + (verdict === "CHASE" ? " (high)" : "");
        } else {
          res.push = "failed";
        }
      } else if (isSell) {
        res.push = junk ? "junk" : "already alerted";
      }

      // 7. Stamp.
      const attempts = Number(L.enrich_attempts || 0) + (modelErrors.length ? 1 : 0);
      const giveUp = modelErrors.length > 0 && attempts >= MAX_ATTEMPTS;
      const done = modelErrors.length === 0 || giveUp;
      await sbPatch("leads", "id=eq." + id, {
        enrich_attempts: attempts,
        enrich_error: modelErrors.length ? modelErrors.join(" | ").slice(0, 900) : null,
        enriched_at: done ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      });
      await event(id, modelErrors.length ? "enrich_failed" : "enriched", {
        attempt: attempts, gave_up: giveUp, errors: modelErrors,
        verdict: L.verdict || null, comps_n: L.comps_n || null, comps_median: L.comps_median || null,
        canon: res.canon || null, desirability_tier: L.desirability_tier || null, classification: L.classification || null,
      });
      res.status = done ? (modelErrors.length ? "gave up" : "enriched") : "retry";
      res.model_errors = modelErrors;

      // 8. v1.7: the lead email to Garett, as soon as the lead is done (enriched or given up on).
      if (done) {
        try {
          res.lead_email = await leadEmail(id);
        } catch (e) {
          res.lead_email = "failed";
          errors.push(ref + " lead_email: " + String((e as Error).message || e));
        }
      }
    } catch (e) {
      res.error = String((e as Error).message || e);
      try {
        await sbPatch("leads", "id=eq." + id, { enrich_attempts: Number(lead.enrich_attempts || 0) + 1, enrich_error: res.error });
        await event(id, "enrich_failed", { attempt: Number(lead.enrich_attempts || 0) + 1, errors: [res.error] });
      } catch (_e) { /* nothing */ }
    }
    (report.enriched as Json[]).push(res);
  }

  report.ms = Date.now() - startedAt;
  return json({ ok: true, v: "1.7", ...report });
});
