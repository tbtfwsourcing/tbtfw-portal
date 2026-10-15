// TBTFW — LEAD CRM — Edge Function v1.3 (Oct 15, 2026, performance pass)
// v1.3: /queue fetches drafts, leads and the Graph-token check in parallel
//       (messages still follow leads, since they need the ids), and the
//       portal key from Vault is cached in the isolate for five minutes
//       instead of being fetched on every request. Status, note and owner
//       writes log their lead_event alongside the patch rather than after it.
//       Net effect: /queue drops from five sequential database hops to three,
//       and a stage or note write from three to one plus the cached key.
// v1.2: CRM routes for leads.html v2.0. /queue now returns 60 days of leads
//       with classification, missing_info, flag and assigned_to; stages gain
//       'replied' and 'junk'; POST /message/{id}/mark records a message sent
//       by hand (status sent, provider manual) instead of abusing /skip;
//       POST /lead/{id}/owner sets assigned_to; GET/POST /voice read and
//       write the voice prompt in portal_kv (key voice_prompt), which
//       lead-enrich reads on every tick, so verbiage edits need no redeploy.
// v1.1: EMAIL SENDS FROM THE PORTAL MAILBOX (Microsoft Graph, delegated,
//       garett@tbtfw.com) when a refresh token exists in Vault (RPC
//       get_ms_refresh_token, written by ms-auth). Created as a Graph draft
//       first (ids for threading), then sent; lands in the Sent folder.
//       provider 'graph', provider_id = internetMessageId, provider_ref =
//       Graph message id, thread_id = conversationId. Resend is the fallback
//       only when no Graph token exists and RESEND_API_KEY is set. Reply
//       drafts (purpose 'reply') send as a Graph reply to the latest inbound
//       message via its provider_ref.
// Backend for leads.html, the approval queue. NOTHING LEAVES WITHOUT A TAP:
// every outbound message is a lead_messages row in status 'draft' until a
// human calls /send on it. Routes (path after /lead-crm), all gated by ?k=
// matching Vault PORTAL_KEY (RPC get_portal_key; the board's ?k= pattern):
//   OPTIONS *                         CORS preflight
//   GET  /queue                       drafts awaiting approval + leads (60d)
//   GET  /voice                       { text, updated_at }
//   POST /voice                       { text } -> portal_kv voice_prompt
//   POST /message/{id}/send           send the draft (body may carry edited
//                                     subject/body); email -> Graph (Resend
//                                     fallback), sms -> Twilio (dark until
//                                     secrets set), dm -> 501
//   POST /message/{id}/mark           the human sent it by hand -> status sent
//   POST /message/{id}/skip           mark the draft skipped (nothing sent)
//   POST /lead/{id}/note              { notes } -> leads.notes
//   POST /lead/{id}/status            { status } -> leads.status
//   POST /lead/{id}/owner             { assigned_to } -> leads.assigned_to
// Secrets: SUPABASE_SERVICE_ROLE_KEY (platform); MS_TENANT_ID, MS_CLIENT_ID,
//   MS_CLIENT_SECRET, MS_MAILBOX (Graph); RESEND_API_KEY + RESEND_FROM
//   (fallback); TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM (optional).
// verify_jwt OFF; the key gate is the auth, same pattern as the board function.

type Json = Record<string, unknown>;

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Max-Age": "86400",
};
const DEFAULT_FROM = "TBTFW <sales@tbtfw.com>";
const RECENT_DAYS = 60;
const GRAPH = "https://graph.microsoft.com/v1.0";
const GRAPH_SCOPES = "offline_access User.Read Mail.Send Mail.ReadWrite";
const STAGES = ["new", "contacted", "replied", "offered", "won", "lost", "duplicate", "junk"];

// The portal key, read from Vault once per isolate and kept for KEY_TTL_MS.
// Rotating PORTAL_KEY therefore takes up to five minutes to bite on a warm isolate.
const KEY_TTL_MS = 5 * 60 * 1000;
let keyCache: { value: string; at: number } = { value: "", at: 0 };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS } });
}
function fail(status: number, error: string, message: string): Response {
  return json({ ok: false, error, message }, status);
}
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function toHtml(text: string): string {
  return "<div style=\"font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#111\"><p>" +
    escapeHtml(text).replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br>") + "</p></div>";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!SUPABASE_URL || !SERVICE_KEY) return fail(500, "platform_env_missing", "Server is not configured.");
  const MS_TENANT = Deno.env.get("MS_TENANT_ID") || "";
  const MS_CLIENT_ID = Deno.env.get("MS_CLIENT_ID") || "";
  const MS_CLIENT_SECRET = Deno.env.get("MS_CLIENT_SECRET") || "";
  const MS_MAILBOX = Deno.env.get("MS_MAILBOX") || "";
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
  const RESEND_FROM = Deno.env.get("RESEND_FROM") || DEFAULT_FROM;
  const TWILIO_SID = Deno.env.get("TWILIO_ACCOUNT_SID") || "";
  const TWILIO_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN") || "";
  const TWILIO_FROM = Deno.env.get("TWILIO_FROM") || "";

  const REST = SUPABASE_URL + "/rest/v1";
  const SB: Record<string, string> = { apikey: SERVICE_KEY, Authorization: "Bearer " + SERVICE_KEY, "Content-Type": "application/json" };

  const url = new URL(req.url);
  let path = url.pathname.replace(/^\/functions\/v1/, "").replace(/^\/lead-crm/, "");
  if (!path.startsWith("/")) path = "/" + path;
  path = path.replace(/\/+$/, "") || "/";

  async function sbSelect(table: string, query: string): Promise<Json[]> {
    const r = await fetch(REST + "/" + table + "?" + query, { headers: SB });
    if (!r.ok) throw new Error(table + " select " + r.status + ": " + (await r.text()));
    return await r.json();
  }
  async function sbPatch(table: string, filter: string, patch: Json): Promise<Json | null> {
    const r = await fetch(REST + "/" + table + "?" + filter, { method: "PATCH", headers: { ...SB, Prefer: "return=representation" }, body: JSON.stringify(patch) });
    if (!r.ok) throw new Error(table + " patch " + r.status + ": " + (await r.text()));
    const rows = await r.json();
    return Array.isArray(rows) && rows.length ? rows[0] : null;
  }
  async function rpc(name: string, args: Json = {}): Promise<unknown> {
    const r = await fetch(REST + "/rpc/" + name, { method: "POST", headers: SB, body: JSON.stringify(args) });
    if (!r.ok) throw new Error("rpc " + name + " " + r.status + ": " + (await r.text()).slice(0, 200));
    return await r.json();
  }
  async function event(leadId: string, ev: string, payload: Json): Promise<void> {
    try {
      await fetch(REST + "/lead_events", { method: "POST", headers: { ...SB, Prefer: "return=minimal" }, body: JSON.stringify({ lead_id: leadId, event: ev, payload }) });
    } catch (_e) { /* never block */ }
  }

  // ---- Graph: token + helpers ------------------------------------------------
  const graphConfigured = !!(MS_TENANT && MS_CLIENT_ID && MS_CLIENT_SECRET && MS_MAILBOX);
  let graphToken: string | null | undefined = undefined;
  async function graphRefreshToken(): Promise<string | null> {
    if (graphToken !== undefined) return graphToken;
    if (!graphConfigured) { graphToken = null; return null; }
    try {
      const v = await rpc("get_ms_refresh_token");
      graphToken = v ? String(v) : null;
    } catch (_e) { graphToken = null; }
    return graphToken;
  }
  async function graphAccessToken(): Promise<string> {
    const refresh = await graphRefreshToken();
    if (!refresh) throw new Error("Mailbox not connected (no Graph token in Vault).");
    const body = new URLSearchParams({ client_id: MS_CLIENT_ID, client_secret: MS_CLIENT_SECRET, grant_type: "refresh_token", refresh_token: refresh, scope: GRAPH_SCOPES });
    const r = await fetch("https://login.microsoftonline.com/" + MS_TENANT + "/oauth2/v2.0/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.access_token) throw new Error("Graph token " + r.status + ": " + String(d.error_description || d.error || "").slice(0, 200));
    if (d.refresh_token && d.refresh_token !== refresh) { try { await rpc("set_ms_refresh_token", { p_token: d.refresh_token }); } catch (_e) { /* keep old */ } }
    return String(d.access_token);
  }
  async function graphFetch(access: string, pathAndQuery: string, init: RequestInit = {}): Promise<{ ok: boolean; status: number; data: Json }> {
    const r = await fetch(GRAPH + pathAndQuery, { ...init, headers: { Authorization: "Bearer " + access, "Content-Type": "application/json", ...(init.headers as Record<string, string> || {}) } });
    const txt = await r.text();
    let data: Json = {};
    try { data = txt ? JSON.parse(txt) : {}; } catch (_e) { data = { raw: txt.slice(0, 300) }; }
    return { ok: r.ok, status: r.status, data };
  }
  async function graphSend(to: string, subject: string, text: string, inReplyToGraphId?: string): Promise<{ internetMessageId: string; conversationId: string; graphId: string }> {
    const access = await graphAccessToken();
    let created: { ok: boolean; status: number; data: Json };
    if (inReplyToGraphId) {
      created = await graphFetch(access, "/me/messages/" + encodeURIComponent(inReplyToGraphId) + "/createReply", { method: "POST", body: "{}" });
      if (!created.ok) throw new Error("Graph createReply " + created.status + ": " + JSON.stringify(created.data).slice(0, 300));
      const id = String(created.data.id);
      const patched = await graphFetch(access, "/me/messages/" + encodeURIComponent(id), { method: "PATCH", body: JSON.stringify({ body: { contentType: "HTML", content: toHtml(text) } }) });
      if (!patched.ok) throw new Error("Graph patch reply " + patched.status + ": " + JSON.stringify(patched.data).slice(0, 300));
      created = patched;
    } else {
      created = await graphFetch(access, "/me/messages", {
        method: "POST",
        body: JSON.stringify({ subject, body: { contentType: "HTML", content: toHtml(text) }, toRecipients: [{ emailAddress: { address: to } }] }),
      });
      if (!created.ok) throw new Error("Graph create " + created.status + ": " + JSON.stringify(created.data).slice(0, 300));
    }
    const graphId = String(created.data.id || "");
    const internetMessageId = String(created.data.internetMessageId || "");
    const conversationId = String(created.data.conversationId || "");
    const sent = await graphFetch(access, "/me/messages/" + encodeURIComponent(graphId) + "/send", { method: "POST", body: "" });
    if (!sent.ok) throw new Error("Graph send " + sent.status + ": " + JSON.stringify(sent.data).slice(0, 300));
    return { internetMessageId, conversationId, graphId };
  }

  // ---- key gate -------------------------------------------------------------
  const k = url.searchParams.get("k") || "";
  let portalKey = Date.now() - keyCache.at < KEY_TTL_MS ? keyCache.value : "";
  if (!portalKey) {
    try { portalKey = String((await rpc("get_portal_key")) || ""); } catch (_e) { portalKey = ""; }
    if (portalKey) keyCache = { value: portalKey, at: Date.now() };
  }
  if (!portalKey) return fail(500, "key_unavailable", "Portal key is not configured in Vault.");
  if (!k || !safeEqual(k, portalKey)) return fail(401, "bad_key", "Bad or missing key.");

  const body: Json = req.method === "POST" ? (await req.json().catch(() => ({})) as Json) : {};

  // ---- GET /queue ------------------------------------------------------------
  if (req.method === "GET" && path === "/queue") {
    try {
      const since = new Date(Date.now() - RECENT_DAYS * 86400000).toISOString();
      // Drafts, leads and the mailbox check are independent: one round trip, not three.
      const [drafts, leads, graphOn] = await Promise.all([
        sbSelect("lead_messages", "status=eq.draft&select=id,lead_id,channel,purpose,to_address,subject,body,created_at&order=created_at.desc&limit=100"),
        sbSelect("leads", "created_at=gte." + encodeURIComponent(since) + "&select=id,ref,kind,status,classification,missing_info,flag,source,channel,full_name,phone,email,contact_pref,stock_id,wanted_text,vin,year,make,model,trim,canon_model,canon_trim,mileage,asking_price,intent,timeline,condition,zip,message,photo_count,ready_at,alerted_at,enriched_at,enrich_error,comps_median,comps_n,verdict,verdict_score,verdict_reasoning,desirability_tier,desirability_why,detected_specs,notes,assigned_to,created_at,updated_at&order=created_at.desc&limit=400"),
        graphRefreshToken().then((t) => !!t),
      ]);
      const ids = leads.map((l) => String(l.id));
      let messages: Json[] = [];
      if (ids.length) {
        messages = await sbSelect("lead_messages", "lead_id=in.(" + ids.join(",") + ")&select=id,lead_id,direction,channel,purpose,status,subject,body,provider,provider_id,thread_id,error,sent_at,created_at&order=created_at.asc&limit=2000");
      }
      const byLead: Record<string, Json[]> = {};
      for (const m of messages) {
        const lid = String(m.lead_id);
        if (!byLead[lid]) byLead[lid] = [];
        byLead[lid].push(m);
      }
      const out = leads.map((l) => ({ ...l, messages: byLead[String(l.id)] || [] }));
      return json({
        ok: true, v: "1.3", generated_at: new Date().toISOString(), stages: STAGES,
        channels: { email: graphOn || !!RESEND_API_KEY, email_via: graphOn ? "graph:" + MS_MAILBOX : (RESEND_API_KEY ? "resend" : null), sms: !!(TWILIO_SID && TWILIO_TOKEN && TWILIO_FROM), dm: false },
        drafts, leads: out,
      });
    } catch (e) {
      return fail(500, "queue_failed", String((e as Error).message || e));
    }
  }

  // ---- GET/POST /voice --------------------------------------------------------
  if (path === "/voice") {
    try {
      if (req.method === "GET") {
        const rows = await sbSelect("portal_kv", "key=eq.voice_prompt&select=value,updated_at&limit=1");
        const v = rows.length ? (rows[0].value as Json) : {};
        return json({ ok: true, text: String(v.text || ""), updated_at: rows.length ? rows[0].updated_at : null, v: v.v || null });
      }
      const text = typeof body.text === "string" ? body.text.trim() : "";
      if (text.length < 100) return fail(400, "too_short", "The voice prompt must be at least 100 characters.");
      if (text.length > 8000) return fail(400, "too_long", "The voice prompt must be under 8,000 characters.");
      const rows = await sbSelect("portal_kv", "key=eq.voice_prompt&select=value&limit=1");
      const prev = rows.length ? Number((rows[0].value as Json).v || 0) : 0;
      const r = await fetch(REST + "/portal_kv", {
        method: "POST", headers: { ...SB, Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ key: "voice_prompt", value: { v: prev + 1, text, updated_by: "leads.html" }, updated_at: new Date().toISOString() }),
      });
      if (!r.ok) throw new Error("portal_kv " + r.status + ": " + (await r.text()).slice(0, 200));
      return json({ ok: true, v: prev + 1, chars: text.length });
    } catch (e) {
      return fail(500, "voice_failed", String((e as Error).message || e));
    }
  }

  if (req.method !== "POST") return fail(404, "not_found", "No such route.");

  // ---- POST /lead/{id}/note | /status | /owner --------------------------------
  // The event row is an audit trail, not a dependency: it is written alongside the patch.
  const lm = path.match(/^\/lead\/([0-9a-fA-F-]{36})\/(note|status|owner)$/);
  if (lm) {
    const leadId = lm[1];
    try {
      if (lm[2] === "note") {
        const notes = typeof body.notes === "string" ? body.notes.slice(0, 4000) : "";
        await Promise.all([
          sbPatch("leads", "id=eq." + leadId, { notes, updated_at: new Date().toISOString() }),
          event(leadId, "note", { chars: notes.length }),
        ]);
        return json({ ok: true, lead_id: leadId, notes });
      }
      if (lm[2] === "owner") {
        const owner = typeof body.assigned_to === "string" ? body.assigned_to.trim().slice(0, 80) : "";
        await Promise.all([
          sbPatch("leads", "id=eq." + leadId, { assigned_to: owner || null, updated_at: new Date().toISOString() }),
          event(leadId, "owner", { assigned_to: owner || null }),
        ]);
        return json({ ok: true, lead_id: leadId, assigned_to: owner || null });
      }
      const status = String(body.status || "");
      if (!STAGES.includes(status)) return fail(400, "bad_status", "status must be one of " + STAGES.join(", "));
      await Promise.all([
        sbPatch("leads", "id=eq." + leadId, { status, updated_at: new Date().toISOString() }),
        event(leadId, "status", { status }),
      ]);
      return json({ ok: true, lead_id: leadId, status });
    } catch (e) {
      return fail(500, "write_failed", String((e as Error).message || e));
    }
  }

  // ---- POST /message/{id}/send | /mark | /skip ---------------------------------
  const mm = path.match(/^\/message\/([0-9a-fA-F-]{36})\/(send|mark|skip)$/);
  if (!mm) return fail(404, "not_found", "No such route.");
  const msgId = mm[1];
  let msg: Json | null = null;
  try {
    const rows = await sbSelect("lead_messages", "id=eq." + msgId + "&select=*&limit=1");
    msg = rows.length ? rows[0] : null;
  } catch (e) {
    return fail(500, "read_failed", String((e as Error).message || e));
  }
  if (!msg) return fail(404, "message_not_found", "No message with that id.");
  const leadId = String(msg.lead_id);
  if (msg.status !== "draft") return fail(409, "not_a_draft", "This message is " + msg.status + "; only drafts can be sent, marked or skipped.");

  if (mm[2] === "skip") {
    try {
      await sbPatch("lead_messages", "id=eq." + msgId, { status: "skipped", updated_at: new Date().toISOString() });
      await event(leadId, "message_skipped", { message_id: msgId, purpose: msg.purpose, channel: msg.channel });
      return json({ ok: true, message_id: msgId, status: "skipped" });
    } catch (e) {
      return fail(500, "write_failed", String((e as Error).message || e));
    }
  }

  const leadRows = await sbSelect("leads", "id=eq." + leadId + "&select=id,ref,full_name,email,phone,status&limit=1").catch(() => []);
  const lead = leadRows.length ? leadRows[0] : null;
  if (!lead) return fail(404, "lead_not_found", "The lead for this message no longer exists.");
  const finalBody = (typeof body.body === "string" && body.body.trim()) ? body.body.trim().slice(0, 6000) : String(msg.body || "");
  const finalSubject = (typeof body.subject === "string" && body.subject.trim()) ? body.subject.trim().slice(0, 200) : (msg.subject ? String(msg.subject) : null);
  const edited = finalBody !== String(msg.body || "") || (finalSubject || "") !== String(msg.subject || "");
  const channel = String(msg.channel);
  const to = String(msg.to_address || (channel === "sms" ? lead.phone : lead.email) || "");

  if (mm[2] === "mark") {
    try {
      const now = new Date().toISOString();
      await sbPatch("lead_messages", "id=eq." + msgId, { status: "sent", body: finalBody, subject: finalSubject, to_address: to || null, provider: "manual", provider_id: null, approved_at: now, sent_at: now, error: null, updated_at: now });
      if (lead.status === "new") await sbPatch("leads", "id=eq." + leadId, { status: "contacted", updated_at: now }).catch(() => null);
      await event(leadId, "message_sent", { message_id: msgId, channel, purpose: msg.purpose, provider: "manual", edited });
      return json({ ok: true, message_id: msgId, status: "sent", provider: "manual" });
    } catch (e) {
      return fail(500, "write_failed", String((e as Error).message || e));
    }
  }

  // send
  if (!to) return fail(400, "no_address", "No " + channel + " address on this lead.");
  let providerId = "";
  let provider = channel === "email" ? "graph" : "twilio";
  let threadId: string | null = msg.thread_id ? String(msg.thread_id) : null;
  let providerRef: string | null = null;
  try {
    if (channel === "email") {
      const refresh = await graphRefreshToken();
      if (refresh) {
        let replyTo: string | undefined;
        if (msg.purpose === "reply") {
          const inbound = await sbSelect("lead_messages", "lead_id=eq." + leadId + "&direction=eq.in&channel=eq.email&provider=eq.graph&provider_ref=not.is.null&select=provider_ref,thread_id&order=created_at.desc&limit=1").catch(() => []);
          replyTo = inbound.length ? String(inbound[0].provider_ref) : undefined;
        }
        const g = await graphSend(to, finalSubject || "Your car — TBTFW", finalBody, replyTo);
        providerId = g.internetMessageId || g.graphId;
        providerRef = g.graphId;
        threadId = g.conversationId || threadId;
        provider = "graph";
      } else if (RESEND_API_KEY) {
        provider = "resend";
        const r = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: "Bearer " + RESEND_API_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ from: RESEND_FROM, to: [to], subject: finalSubject || ("Your car — TBTFW"), text: finalBody, html: toHtml(finalBody) }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok || !d.id) throw new Error("Resend " + r.status + " " + JSON.stringify(d).slice(0, 300));
        providerId = String(d.id);
      } else {
        throw new Error("Email is off: the mailbox is not connected (run ms-auth) and RESEND_API_KEY is not set.");
      }
    } else if (channel === "sms") {
      if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM) throw new Error("Twilio secrets are not set; text sending is off until the number is approved.");
      const r = await fetch("https://api.twilio.com/2010-04-01/Accounts/" + TWILIO_SID + "/Messages.json", {
        method: "POST",
        headers: { Authorization: "Basic " + btoa(TWILIO_SID + ":" + TWILIO_TOKEN), "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ To: to, From: TWILIO_FROM, Body: finalBody }).toString(),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.sid) throw new Error("Twilio " + r.status + " " + JSON.stringify(d).slice(0, 300));
      providerId = String(d.sid);
    } else {
      return fail(501, "channel_unavailable", "Instagram DM sending is not available until the Meta app is approved.");
    }
  } catch (e) {
    const err = String((e as Error).message || e).slice(0, 500);
    await sbPatch("lead_messages", "id=eq." + msgId, { status: "failed", error: err, body: finalBody, subject: finalSubject, provider, updated_at: new Date().toISOString() }).catch(() => null);
    await event(leadId, "message_failed", { message_id: msgId, channel, provider, error: err });
    return fail(502, "send_failed", err);
  }

  const now = new Date().toISOString();
  await sbPatch("lead_messages", "id=eq." + msgId, {
    status: "sent", body: finalBody, subject: finalSubject, to_address: to, provider, provider_id: providerId, provider_ref: providerRef, thread_id: threadId,
    approved_at: now, sent_at: now, error: null, updated_at: now,
  });
  if (lead.status === "new") await sbPatch("leads", "id=eq." + leadId, { status: "contacted", updated_at: now }).catch(() => null);
  await event(leadId, "message_sent", { message_id: msgId, channel, purpose: msg.purpose, provider, provider_id: providerId, thread_id: threadId, edited });
  return json({ ok: true, message_id: msgId, status: "sent", channel, provider, provider_id: providerId, edited });
});
