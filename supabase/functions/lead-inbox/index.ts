// TBTFW — LEAD INBOX — Edge Function v1.0 (Oct 15, 2026, portal session three)
// Polls the portal mailbox (Microsoft Graph, delegated token from Vault via
// RPC get_ms_refresh_token) for new inbox mail and lands seller replies as
// lead_messages rows: direction 'in', channel 'email', purpose 'reply',
// status 'received', provider 'graph', provider_id = internetMessageId,
// provider_ref = Graph message id (what createReply needs), thread_id =
// conversationId, to_address = the SENDER's address (the column is reused;
// there is no from column), sent_at = receivedDateTime.
// MATCHING, in order: (1) an outbound lead_messages row with the same
// thread_id (conversationId) -> that lead; (2) a lead whose email equals the
// sender, created in the last 90 days, newest first; (3) no match -> ignored
// (ordinary mail in the same inbox is never touched or stored).
// Dedupe: partial unique index lead_messages_inbound_provider_id_uniq
// (provider, provider_id) where direction='in' — a 23505 means already seen.
// CURSOR: portal_kv key 'ms_inbox_cursor' {since}; first run looks back 24h;
// each run advances to the newest receivedDateTime seen (ge filter, so the
// boundary message re-reads and dedupes).
// On each stored reply: lead_events 'message_received', leads.updated_at,
// Pushover "REPLY // identity // mileage" priority 1 with the first line.
// Runs every two minutes from pg_cron (anon bearer; verify_jwt ON). Body
// {"lookback_hours": N} forces a wider window once (tests).
// Secrets: SUPABASE_SERVICE_ROLE_KEY (platform); MS_TENANT_ID, MS_CLIENT_ID,
//   MS_CLIENT_SECRET, MS_MAILBOX; PUSHOVER_APP_TOKEN / PUSHOVER_USER_KEY (env
//   first, Vault RPC get_pushover_keys fallback); PORTAL_LEADS_URL (optional).

type Json = Record<string, unknown>;

const GRAPH = "https://graph.microsoft.com/v1.0";
const GRAPH_SCOPES = "offline_access User.Read Mail.Send Mail.ReadWrite";
const CURSOR_KEY = "ms_inbox_cursor";
const MATCH_DAYS = 90;
const PAGE = 50;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
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
// HTML -> text, then cut the quoted history so the stored body is the reply itself.
function bodyText(contentType: string, content: string): string {
  let t = content || "";
  if (/html/i.test(contentType)) {
    t = t.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<script[\s\S]*?<\/script>/gi, "");
    t = t.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n").replace(/<[^>]+>/g, "");
    t = t.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#39;/g, "'");
  }
  t = t.replace(/\r/g, "");
  const cut = t.search(/\n(From:|-----Original Message-----|On .{5,120} wrote:|Sent from my |________________________________)/);
  if (cut > 0) t = t.slice(0, cut);
  return t.replace(/\n{3,}/g, "\n\n").trim().slice(0, 6000);
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const MS_TENANT = Deno.env.get("MS_TENANT_ID") || "";
  const MS_CLIENT_ID = Deno.env.get("MS_CLIENT_ID") || "";
  const MS_CLIENT_SECRET = Deno.env.get("MS_CLIENT_SECRET") || "";
  const MS_MAILBOX = (Deno.env.get("MS_MAILBOX") || "").toLowerCase();
  const LEADS_URL = Deno.env.get("PORTAL_LEADS_URL") || "";
  if (!SUPABASE_URL || !SERVICE_KEY) return json({ ok: false, error: "platform env missing" }, 500);
  if (!MS_TENANT || !MS_CLIENT_ID || !MS_CLIENT_SECRET || !MS_MAILBOX) return json({ ok: true, v: "1.0", skipped: "MS secrets missing" });

  const REST = SUPABASE_URL + "/rest/v1";
  const SB: Record<string, string> = { apikey: SERVICE_KEY, Authorization: "Bearer " + SERVICE_KEY, "Content-Type": "application/json" };
  const body = await req.json().catch(() => ({})) as Json;
  const report: Json = { v: "1.0", fetched: 0, matched: 0, stored: 0, duplicates: 0, ignored: 0, pushes: 0, errors: [] as string[] };
  const errors = report.errors as string[];

  async function sbSelect(table: string, query: string): Promise<Json[]> {
    const r = await fetch(REST + "/" + table + "?" + query, { headers: SB });
    if (!r.ok) throw new Error(table + " select " + r.status + ": " + (await r.text()));
    return await r.json();
  }
  async function sbPatch(table: string, filter: string, patch: Json): Promise<void> {
    const r = await fetch(REST + "/" + table + "?" + filter, { method: "PATCH", headers: { ...SB, Prefer: "return=minimal" }, body: JSON.stringify(patch) });
    if (!r.ok) throw new Error(table + " patch " + r.status + ": " + (await r.text()));
  }
  async function rpc(name: string, args: Json = {}): Promise<unknown> {
    const r = await fetch(REST + "/rpc/" + name, { method: "POST", headers: SB, body: JSON.stringify(args) });
    if (!r.ok) throw new Error("rpc " + name + " " + r.status + ": " + (await r.text()).slice(0, 200));
    return await r.json();
  }
  async function event(leadId: string, ev: string, payload: Json): Promise<void> {
    try { await fetch(REST + "/lead_events", { method: "POST", headers: { ...SB, Prefer: "return=minimal" }, body: JSON.stringify({ lead_id: leadId, event: ev, payload }) }); } catch (_e) { /* never block */ }
  }
  async function pushoverKeys(): Promise<{ token: string; user: string } | null> {
    let token = Deno.env.get("PUSHOVER_APP_TOKEN") || "";
    let user = Deno.env.get("PUSHOVER_USER_KEY") || "";
    if (!token || !user) {
      try {
        const rows = await rpc("get_pushover_keys") as Json[];
        const row = Array.isArray(rows) && rows.length ? rows[0] : null;
        token = row && row.app_token ? String(row.app_token) : token;
        user = row && row.user_key ? String(row.user_key) : user;
      } catch (_e) { /* fall through */ }
    }
    return token && user ? { token, user } : null;
  }
  async function push(leadId: string, title: string, message: string, priority = 1): Promise<boolean> {
    try {
      const keys = await pushoverKeys();
      if (!keys) throw new Error("Pushover keys unavailable");
      const form = new URLSearchParams({ token: keys.token, user: keys.user, title, message, priority: String(priority) });
      if (LEADS_URL) { form.set("url", LEADS_URL); form.set("url_title", "Open leads"); }
      const r = await fetch("https://api.pushover.net/1/messages.json", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form.toString() });
      const d = await r.json();
      if (!r.ok || d.status !== 1) throw new Error("Pushover " + r.status + " " + JSON.stringify(d));
      await event(leadId, "push_reply", { title, priority });
      return true;
    } catch (e) {
      await event(leadId, "push_failed", { error: String((e as Error).message || e), title, via: "push_reply" });
      return false;
    }
  }

  // ---- Graph access token ----------------------------------------------------
  let access = "";
  try {
    const refresh = await rpc("get_ms_refresh_token");
    if (!refresh) return json({ ok: true, ...report, skipped: "mailbox not connected" });
    const form = new URLSearchParams({ client_id: MS_CLIENT_ID, client_secret: MS_CLIENT_SECRET, grant_type: "refresh_token", refresh_token: String(refresh), scope: GRAPH_SCOPES });
    const r = await fetch("https://login.microsoftonline.com/" + MS_TENANT + "/oauth2/v2.0/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.access_token) throw new Error("token " + r.status + ": " + String(d.error_description || d.error || "").slice(0, 200));
    access = String(d.access_token);
    if (d.refresh_token && d.refresh_token !== refresh) { try { await rpc("set_ms_refresh_token", { p_token: d.refresh_token }); } catch (_e) { /* keep old */ } }
  } catch (e) {
    return json({ ok: false, ...report, error: "graph auth: " + String((e as Error).message || e) }, 502);
  }

  // ---- cursor ----------------------------------------------------------------
  let since = "";
  try {
    const rows = await sbSelect("portal_kv", "key=eq." + CURSOR_KEY + "&select=value&limit=1");
    since = rows.length && rows[0].value && (rows[0].value as Json).since ? String((rows[0].value as Json).since) : "";
  } catch (e) { errors.push("cursor read: " + String((e as Error).message || e)); }
  const lookbackHours = Number(body.lookback_hours);
  if (!since || (Number.isFinite(lookbackHours) && lookbackHours > 0)) {
    since = new Date(Date.now() - (Number.isFinite(lookbackHours) && lookbackHours > 0 ? lookbackHours : 24) * 3600000).toISOString();
  }
  report.since = since;

  // ---- fetch inbox -----------------------------------------------------------
  let messages: Json[] = [];
  try {
    const q = "/me/mailFolders/inbox/messages?$filter=" + encodeURIComponent("receivedDateTime ge " + since) +
      "&$orderby=receivedDateTime%20asc&$top=" + PAGE + "&$select=id,conversationId,internetMessageId,from,subject,body,bodyPreview,receivedDateTime,isDraft";
    const r = await fetch(GRAPH + q, { headers: { Authorization: "Bearer " + access, Prefer: "outlook.body-content-type=\"text\"" } });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error("inbox " + r.status + ": " + JSON.stringify(d).slice(0, 300));
    messages = Array.isArray(d.value) ? d.value : [];
  } catch (e) {
    return json({ ok: false, ...report, error: "graph inbox: " + String((e as Error).message || e) }, 502);
  }
  report.fetched = messages.length;

  let newest = since;
  for (const m of messages) {
    const received = String(m.receivedDateTime || "");
    if (received > newest) newest = received;
    if (m.isDraft) continue;
    const from = String(((m.from as Json)?.emailAddress as Json)?.address || "").toLowerCase();
    const fromName = String(((m.from as Json)?.emailAddress as Json)?.name || "");
    if (!from || from === MS_MAILBOX) { (report.ignored as number)++; continue; }
    const conv = String(m.conversationId || "");
    const imid = String(m.internetMessageId || m.id);
    try {
      // (1) thread match
      let leadId = "";
      if (conv) {
        const t = await sbSelect("lead_messages", "thread_id=eq." + encodeURIComponent(conv) + "&direction=eq.out&select=lead_id&order=created_at.desc&limit=1");
        if (t.length) leadId = String(t[0].lead_id);
      }
      // (2) sender match
      if (!leadId) {
        const floor = new Date(Date.now() - MATCH_DAYS * 86400000).toISOString();
        const ls = await sbSelect("leads", "email=ilike." + encodeURIComponent(from) + "&created_at=gte." + encodeURIComponent(floor) + "&status=neq.duplicate&select=id&order=created_at.desc&limit=1");
        if (ls.length) leadId = String(ls[0].id);
      }
      if (!leadId) { (report.ignored as number)++; continue; }
      (report.matched as number)++;

      const bodyObj = (m.body as Json) || {};
      const text = bodyText(String(bodyObj.contentType || "text"), String(bodyObj.content || m.bodyPreview || ""));
      const ins = await fetch(REST + "/lead_messages", {
        method: "POST",
        headers: { ...SB, Prefer: "return=representation" },
        body: JSON.stringify({
          lead_id: leadId, direction: "in", channel: "email", purpose: "reply", to_address: from,
          subject: String(m.subject || "").slice(0, 200), body: text || String(m.bodyPreview || "").slice(0, 6000),
          status: "received", provider: "graph", provider_id: imid, provider_ref: String(m.id), thread_id: conv || null,
          sent_at: received || new Date().toISOString(),
        }),
      });
      if (ins.status === 409) { (report.duplicates as number)++; continue; }
      if (!ins.ok) throw new Error("insert " + ins.status + ": " + (await ins.text()).slice(0, 300));
      const row = (await ins.json())[0] as Json;
      (report.stored as number)++;
      await sbPatch("leads", "id=eq." + leadId, { updated_at: new Date().toISOString() });
      await event(leadId, "message_received", { message_id: row.id, channel: "email", from, subject: m.subject, chars: text.length });

      const lead = (await sbSelect("leads", "id=eq." + leadId + "&select=ref,kind,full_name,year,make,model,trim,canon_model,canon_trim,mileage,verdict&limit=1"))[0] || {};
      const title = "REPLY // " + (lead.verdict ? String(lead.verdict) + " // " : "") + identityLine(lead) + (lead.kind === "sell" ? " // " + miles(lead.mileage) : "");
      const first = (text || String(m.bodyPreview || "")).split("\n").map((s) => s.trim()).filter(Boolean)[0] || "(no text)";
      const msg = [first.slice(0, 240), (fromName ? fromName + " // " : "") + from, "Ref " + lead.ref + " // draft reply coming to the queue"].join("\n");
      if (await push(leadId, title, msg, 1)) (report.pushes as number)++;
    } catch (e) {
      errors.push(imid.slice(0, 40) + ": " + String((e as Error).message || e));
    }
  }

  // ---- advance cursor ----------------------------------------------------------
  try {
    await fetch(REST + "/portal_kv", {
      method: "POST",
      headers: { ...SB, Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ key: CURSOR_KEY, value: { since: newest }, updated_at: new Date().toISOString() }),
    });
    report.cursor = newest;
  } catch (e) { errors.push("cursor write: " + String((e as Error).message || e)); }

  return json({ ok: true, ...report });
});
