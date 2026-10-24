// TBTFW — INVENTORY SYNC — Edge Function v1.1 (Oct 14, 2026)
// v1.1: trim falls back to modelNum; this feed leaves trim empty and carries "Super Sport 300+",
//       "LP 750-4 SV", "Tailor Made" in modelNum. No other change.
// Mirrors TBTFW.com's live inventory into public.tbtfw_inventory for the portal's buy picker.
// Source: https://www.tbtfw.com/inventory is server-rendered and embeds one structured vehicle
// object per car in its hydration data ({id:"<32hex>",stockNum:"…",vin:"…",year:N,make:"…",
// model:"…",trim:"…",…,images:[…],vdpUrl:"…",saleStatus:"…",…}). Direct fetch, no Firecrawl.
// Rules: keep saleStatus Available; key = stockNum with any "-duplicate" suffix stripped (last
// wins); upsert preserves first_seen_at; rows absent from a run get missed_runs+1 and flip
// active=false at 2 misses (public.inventory_mark_missing). Guard: fewer than MIN_PARSE vehicles
// parsed = abort without touching rows, so a bad fetch can never empty the picker.
// Secrets: SUPABASE_SERVICE_ROLE_KEY (platform). verify_jwt ON; pg_cron calls with the anon bearer
// exactly like the forsale-ingest jobs. Logs one lead_events row (lead_id null, event inventory_sync).

type Json = Record<string, unknown>;

const SOURCE_URL = "https://www.tbtfw.com/inventory";
const VDP_BASE = "https://www.tbtfw.com/vehicle-details/";
const MIN_PARSE = 5;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function unesc(s: string): string {
  return s.replace(/\\"/g, '"').replace(/\\\\/g, "\\").replace(/\\n/g, " ").trim();
}
function field(block: string, key: string): string | null {
  const m = block.match(new RegExp("(?:^|[,{])" + key + ':"((?:[^"\\\\]|\\\\.)*)"'));
  return m ? unesc(m[1]) : null;
}
function num(block: string, key: string): number | null {
  const m = block.match(new RegExp("(?:^|[,{])" + key + ":(-?[0-9]+(?:\\.[0-9]+)?)"));
  return m ? Number(m[1]) : null;
}
function firstImage(block: string): string | null {
  const m = block.match(/images:\["([^"]+)"/);
  return m ? m[1] : null;
}
function normStock(s: string | null, vin: string | null): string | null {
  let v = (s || "").trim().replace(/[-_ ]?duplicate$/i, "").trim();
  if (!v && vin && vin.length === 17) v = vin.slice(-6);
  return v || null;
}

Deno.serve(async (_req: Request) => {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!SUPABASE_URL || !SERVICE_KEY) return json({ ok: false, error: "platform env missing" }, 500);
  const REST = SUPABASE_URL + "/rest/v1";
  const SB: Record<string, string> = { apikey: SERVICE_KEY, Authorization: "Bearer " + SERVICE_KEY, "Content-Type": "application/json" };
  const startedAt = new Date().toISOString();

  async function log(payload: Json): Promise<void> {
    try {
      await fetch(REST + "/lead_events", { method: "POST", headers: { ...SB, Prefer: "return=minimal" }, body: JSON.stringify({ lead_id: null, event: "inventory_sync", payload }) });
    } catch (_e) { /* never block */ }
  }

  // ---- 1. fetch the page ------------------------------------------------------
  let html = "";
  let status = 0;
  try {
    const r = await fetch(SOURCE_URL, { headers: { "User-Agent": "Mozilla/5.0 (compatible; TBTFW-portal-sync/1.0)", Accept: "text/html" } });
    status = r.status;
    html = await r.text();
  } catch (e) {
    const err = "fetch failed: " + String((e as Error).message || e);
    await log({ ok: false, error: err, started_at: startedAt });
    return json({ ok: false, error: err }, 502);
  }
  if (status !== 200 || html.length < 10000) {
    const err = "unexpected page: status " + status + ", " + html.length + " bytes";
    await log({ ok: false, error: err, started_at: startedAt });
    return json({ ok: false, error: err }, 502);
  }

  // ---- 2. parse vehicle objects ----------------------------------------------
  const vehicles: Json[] = [];
  const re = /\{id:"([0-9a-f]{32})",stockNum:"/g;
  let m: RegExpExecArray | null;
  const starts: { id: string; pos: number }[] = [];
  while ((m = re.exec(html)) !== null) starts.push({ id: m[1], pos: m.index });
  for (let i = 0; i < starts.length; i++) {
    const from = starts[i].pos;
    const to = i + 1 < starts.length ? starts[i + 1].pos : Math.min(html.length, from + 40000);
    const block = html.slice(from, to);
    const vin = (field(block, "vin") || "").toUpperCase().replace(/[^A-Z0-9]/g, "") || null;
    const stock = normStock(field(block, "stockNum"), vin);
    if (!stock) continue;
    const saleStatus = (field(block, "saleStatus") || "").toLowerCase();
    const trim = field(block, "trim") || field(block, "modelNum");
    const colorF = field(block, "extColorFactory");
    const color = colorF || field(block, "extColor");
    const price = num(block, "internetPrice") || num(block, "price") || num(block, "showroomPrice");
    vehicles.push({
      stock_id: stock,
      vin,
      year: num(block, "year"),
      make: field(block, "make"),
      model: field(block, "model"),
      trim: trim && trim.length ? trim : null,
      mileage: num(block, "mileage"),
      price: price && price > 0 ? Math.round(price) : null,
      color: color && color.length ? color : null,
      vdp_url: VDP_BASE + starts[i].id,
      image_url: firstImage(block),
      sale_status: saleStatus || "unknown",
    });
  }
  const available = vehicles.filter((v) => v.sale_status === "available" || v.sale_status === "unknown");
  if (available.length < MIN_PARSE) {
    const err = "parse guard: " + vehicles.length + " parsed, " + available.length + " available (< " + MIN_PARSE + "), rows untouched";
    await log({ ok: false, error: err, bytes: html.length, started_at: startedAt });
    return json({ ok: false, error: err, parsed: vehicles.length }, 500);
  }

  // dedupe by stock_id, last wins
  const byStock: Record<string, Json> = {};
  for (const v of available) byStock[String(v.stock_id)] = v;
  const rows = Object.keys(byStock).map((k) => {
    const v = byStock[k];
    return {
      stock_id: v.stock_id, vin: v.vin, year: v.year, make: v.make, model: v.model, trim: v.trim,
      mileage: v.mileage, price: v.price, color: v.color, vdp_url: v.vdp_url, image_url: v.image_url,
      active: true, missed_runs: 0, last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    };
  });

  // ---- 3. upsert, preserving first_seen_at -------------------------------------
  const up = await fetch(REST + "/tbtfw_inventory?on_conflict=stock_id", {
    method: "POST",
    headers: { ...SB, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(rows),
  });
  if (!up.ok) {
    const err = "upsert " + up.status + ": " + (await up.text());
    await log({ ok: false, error: err, parsed: vehicles.length, started_at: startedAt });
    return json({ ok: false, error: err }, 500);
  }

  // ---- 4. mark the rest missing ------------------------------------------------
  let marked = 0, deactivated = 0;
  const mk = await fetch(REST + "/rpc/inventory_mark_missing", { method: "POST", headers: SB, body: JSON.stringify({ seen: rows.map((r) => r.stock_id) }) });
  if (mk.ok) {
    const d = await mk.json();
    const row = Array.isArray(d) && d.length ? d[0] : d;
    marked = Number(row && row.marked) || 0;
    deactivated = Number(row && row.deactivated) || 0;
  }

  const summary = {
    ok: true, bytes: html.length, parsed: vehicles.length, available: available.length, upserted: rows.length,
    not_available: vehicles.length - available.length, marked_missing: marked, deactivated,
    started_at: startedAt, finished_at: new Date().toISOString(),
  };
  await log(summary);
  return json(summary);
});
