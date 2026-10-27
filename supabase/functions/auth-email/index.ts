// TBTFW — AUTH EMAIL — Edge Function v1.0 (Oct 27, 2026)
// Sends Supabase Auth's emails (the CRM sign-in code, and the rarer invite / reset / email-change
// ones) from the portal mailbox (garett@tbtfw.com) through Microsoft Graph, instead of SMTP.
// Why: the same email sent through Resend from noreply@auth.tbtfw.com was accepted by Microsoft 365
// and then never reached the mailbox (a brand-new sender on a subdomain of the recipient's own
// domain, carrying a sign-in link). Mail from the tenant's own mailbox is internal and lands in the
// inbox, as the lead emails from lead-enrich do. Everyone who can sign in is on @tbtfw.com.
// Wiring: Auth → Hooks → Send Email (Postgres) → public.send_auth_email(event), which posts the event
// here through pg_net with header x-hook-secret = Vault AUTH_EMAIL_HOOK_SECRET. This function checks it
// with RPC check_auth_email_hook_secret (service_role only), so verify_jwt is OFF. SQL in
// supabase/sql/2026-10-27_auth_email_hook.sql. Turning the hook off in the dashboard falls back to
// Supabase's SMTP settings (Resend) at once.
// A failed send is retried once; if it still fails, Garett gets a Pushover alert (never the code), and
// the failure is logged as lead_events 'auth_email_failed'. Codes are never logged.
// Secrets: SUPABASE_SERVICE_ROLE_KEY (platform); MS_TENANT_ID / MS_CLIENT_ID / MS_CLIENT_SECRET (shared
// with lead-crm and lead-enrich); refresh token from Vault via get_ms_refresh_token.

type Json = Record<string, unknown>;

const GRAPH_SCOPES = "offline_access User.Read Mail.Send Mail.ReadWrite";
const PUSH_TITLE = "SIGN-IN EMAIL FAILED";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// What each kind of Auth email says. A kind not listed here (Supabase's security notices, say) gets
// the generic wording, so nothing Auth sends is dropped.
const COPY: Record<string, { subject: string; title: string; lead: string; button: string }> = {
  magiclink: { subject: "Your TBTFW sign-in code", title: "Your TBTFW sign-in code", lead: "Type this code into the TBTFW CRM. It expires shortly and works once.", button: "Sign in" },
  signup: { subject: "Your TBTFW sign-in code", title: "Your TBTFW sign-in code", lead: "Type this code into the TBTFW CRM. It expires shortly and works once.", button: "Sign in" },
  invite: { subject: "You're invited to the TBTFW CRM", title: "You're invited to the TBTFW CRM", lead: "Use this code or the button below to sign in for the first time.", button: "Accept invite" },
  recovery: { subject: "Your TBTFW reset code", title: "Reset your TBTFW sign-in", lead: "Use this code or the button below. It expires shortly and works once.", button: "Reset" },
  email_change: { subject: "Confirm your TBTFW email change", title: "Confirm your email change", lead: "Use this code or the button below to confirm this address.", button: "Confirm" },
  reauthentication: { subject: "Your TBTFW confirmation code", title: "Confirm it's you", lead: "Type this code into the TBTFW CRM. It expires shortly and works once.", button: "" },
};
const GENERIC = { subject: "TBTFW account notice", title: "TBTFW account notice", lead: "", button: "" };

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const MS_TENANT = Deno.env.get("MS_TENANT_ID") || "";
  const MS_CLIENT_ID = Deno.env.get("MS_CLIENT_ID") || "";
  const MS_CLIENT_SECRET = Deno.env.get("MS_CLIENT_SECRET") || "";
  if (!SUPABASE_URL || !SERVICE_KEY) return json({ ok: false, error: "platform env missing" }, 500);
  const REST = SUPABASE_URL + "/rest/v1";
  const SB: Record<string, string> = { apikey: SERVICE_KEY, Authorization: "Bearer " + SERVICE_KEY, "Content-Type": "application/json" };

  // ---- gate: only the Postgres hook knows the secret ------------------------------------------
  const secret = req.headers.get("x-hook-secret") || "";
  if (secret.length < 32) return json({ ok: false, error: "forbidden" }, 403);
  const check = await fetch(REST + "/rpc/check_auth_email_hook_secret", { method: "POST", headers: SB, body: JSON.stringify({ p_secret: secret }) });
  if (!check.ok || (await check.json()) !== true) return json({ ok: false, error: "forbidden" }, 403);

  const body = await req.json().catch(() => null) as Json | null;
  const user = (body?.user || {}) as Json;
  const d = (body?.email_data || {}) as Json;
  const type = String(d.email_action_type || "");
  if (!user.email || !type) return json({ ok: false, error: "bad event" }, 400);

  async function event(ev: string, payload: Json): Promise<void> {
    try {
      await fetch(REST + "/lead_events", { method: "POST", headers: { ...SB, Prefer: "return=minimal" }, body: JSON.stringify({ lead_id: null, event: ev, payload }) });
    } catch (_e) { /* events never block */ }
  }
  async function alert(message: string): Promise<void> {
    try {
      const r = await fetch(REST + "/rpc/get_pushover_keys", { method: "POST", headers: SB, body: "{}" });
      const rows = r.ok ? await r.json() : [];
      const k = Array.isArray(rows) && rows.length ? rows[0] : null;
      if (!k?.app_token || !k?.user_key) return;
      await fetch("https://api.pushover.net/1/messages.json", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: String(k.app_token), user: String(k.user_key), title: PUSH_TITLE, message, priority: "1" }).toString(),
      });
    } catch (_e) { /* the lead_events row still records it */ }
  }
  async function graphAccess(): Promise<string> {
    if (!MS_TENANT || !MS_CLIENT_ID || !MS_CLIENT_SECRET) throw new Error("Microsoft secrets missing");
    const rr = await fetch(REST + "/rpc/get_ms_refresh_token", { method: "POST", headers: SB, body: "{}" });
    const refresh = rr.ok ? await rr.json() : null;
    if (!refresh) throw new Error("mailbox not connected");
    const form = new URLSearchParams({ client_id: MS_CLIENT_ID, client_secret: MS_CLIENT_SECRET, grant_type: "refresh_token", refresh_token: String(refresh), scope: GRAPH_SCOPES });
    const r = await fetch("https://login.microsoftonline.com/" + MS_TENANT + "/oauth2/v2.0/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form });
    const t = await r.json().catch(() => ({}));
    if (!r.ok || !t.access_token) throw new Error("Graph token " + r.status + ": " + String(t.error_description || t.error || "").slice(0, 200));
    if (t.refresh_token && t.refresh_token !== refresh) {
      try { await fetch(REST + "/rpc/set_ms_refresh_token", { method: "POST", headers: SB, body: JSON.stringify({ p_token: t.refresh_token }) }); } catch (_e) { /* keep the old one */ }
    }
    return String(t.access_token);
  }

  // ---- which emails to send ---------------------------------------------------------------------
  // email_change with Secure Email Change sends two (the hash names are swapped on purpose, per the
  // Supabase docs: token_hash_new goes with the current address and token).
  const mails: { to: string; token: string; hash: string }[] = [];
  if (type === "email_change") {
    if (d.token_hash && d.token_hash_new) {
      mails.push({ to: String(user.email), token: String(d.token || ""), hash: String(d.token_hash_new) });
      if (user.new_email) mails.push({ to: String(user.new_email), token: String(d.token_new || ""), hash: String(d.token_hash) });
    } else {
      mails.push({ to: String(user.new_email || user.email), token: String(d.token || d.token_new || ""), hash: String(d.token_hash || d.token_hash_new || "") });
    }
  } else {
    mails.push({ to: String(user.email), token: String(d.token || ""), hash: String(d.token_hash || "") });
  }

  function render(m: { token: string; hash: string }): { subject: string; html: string } {
    const c = COPY[type] || GENERIC;
    const link = m.hash
      ? SUPABASE_URL + "/auth/v1/verify?token=" + encodeURIComponent(m.hash) + "&type=" + encodeURIComponent(type) +
        (d.redirect_to ? "&redirect_to=" + encodeURIComponent(String(d.redirect_to)) : "")
      : "";
    const lead = c.lead || "This is a notice about your TBTFW CRM sign-in (" + type.replace(/_/g, " ") + "). If it wasn't you, tell Garett.";
    const html =
      "<div style=\"font-family:-apple-system,'Helvetica Neue',Helvetica,Arial,sans-serif;color:#111111;max-width:480px\">" +
      "<h2 style=\"font-size:22px;font-weight:600;margin:0 0 12px\">" + escapeHtml(c.title) + "</h2>" +
      "<p style=\"font-size:15px;line-height:1.5;margin:0 0 20px\">" + escapeHtml(lead) + "</p>" +
      (m.token ? "<p style=\"font-family:Menlo,Consolas,'Courier New',monospace;font-size:34px;font-weight:700;letter-spacing:8px;margin:0 0 28px\">" + escapeHtml(m.token) + "</p>" : "") +
      (link && c.button
        ? "<p style=\"font-size:15px;line-height:1.5;margin:0 0 14px\">Or " + escapeHtml(c.button.toLowerCase()) + " with one tap on this device:</p>" +
          "<table role=\"presentation\" cellspacing=\"0\" cellpadding=\"0\" border=\"0\" style=\"margin:0 0 28px\"><tr><td style=\"background:#0a0908\">" +
          "<a href=\"" + escapeHtml(link) + "\" style=\"display:inline-block;padding:15px 36px;font-size:13px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:#ffffff;text-decoration:none\">" + escapeHtml(c.button) + "</a>" +
          "</td></tr></table>"
        : "") +
      (m.token ? "<p style=\"font-size:13px;line-height:1.5;color:#666666;margin:0\">On iPhone, type the code into the TBTFW home-screen app. The button opens Safari, which keeps its own sign-in.</p>" : "") +
      "</div>";
    return { subject: c.subject, html };
  }

  // ---- send -------------------------------------------------------------------------------------
  let token = "";
  async function send(to: string, subject: string, html: string): Promise<void> {
    token ||= await graphAccess();
    const r = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ message: { subject, body: { contentType: "HTML", content: html }, toRecipients: [{ emailAddress: { address: to } }] }, saveToSentItems: false }),
    });
    if (r.status !== 202) throw new Error("Graph sendMail " + r.status + ": " + (await r.text()).slice(0, 200));
  }

  for (const m of mails) {
    const { subject, html } = render(m);
    try {
      try {
        await send(m.to, subject, html);
      } catch (_first) {
        token = ""; // a fresh Graph token on the retry
        await send(m.to, subject, html);
      }
      await event("auth_email_sent", { type, to: m.to });
    } catch (e) {
      const error = String((e as Error).message || e).slice(0, 300);
      await event("auth_email_failed", { type, to: m.to, error });
      await alert("A " + type.replace(/_/g, " ") + " email to " + m.to + " could not be sent: " + error.slice(0, 160) +
        "\nTo fall back to Resend: Supabase → Authentication → Hooks → turn off Send Email.");
      return json({ ok: false, error: "send failed" }, 502);
    }
  }
  return json({ ok: true, v: "1.0", sent: mails.length });
});
