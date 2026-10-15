// ms-auth v1.0 — Microsoft Graph delegated sign-in for the TBTFW portal mailbox.
// Routes (verify_jwt OFF; /start and /status are gated by Vault PORTAL_KEY via ?k=):
//   GET /start?k=KEY    -> 302 to Microsoft sign-in (state is HMAC-signed with PORTAL_KEY)
//   GET /callback        -> exchanges the code, stores refresh token in Vault (RPC set_ms_refresh_token), shows a plain confirmation
//   GET /status?k=KEY   -> refreshes a token and reports the connected mailbox
// Secrets: MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET, MS_MAILBOX (expected UPN). Token never leaves Vault.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TENANT = Deno.env.get("MS_TENANT_ID") ?? "";
const CLIENT_ID = Deno.env.get("MS_CLIENT_ID") ?? "";
const CLIENT_SECRET = Deno.env.get("MS_CLIENT_SECRET") ?? "";
const MAILBOX = (Deno.env.get("MS_MAILBOX") ?? "").toLowerCase();
const SCOPES = "offline_access User.Read Mail.Send Mail.ReadWrite";
const REDIRECT = `${SB_URL}/functions/v1/ms-auth/callback`;

const sb = createClient(SB_URL, SERVICE, { auth: { persistSession: false } });

function html(body: string, status = 200) {
  return new Response(
    `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="background:#000;color:#eee;font-family:Inter,system-ui,sans-serif;padding:32px;line-height:1.5"><div style="font-size:12px;letter-spacing:.2em;opacity:.6">TBTFW // MAIL</div><div style="margin-top:16px;font-size:16px">${body}</div></body>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

async function portalKey(): Promise<string> {
  const { data, error } = await sb.rpc("get_portal_key");
  if (error || !data) throw new Error("portal key unavailable");
  return String(data);
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function hmac(key: string, msg: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function gated(url: URL): Promise<boolean> {
  const k = url.searchParams.get("k") ?? "";
  if (!k) return false;
  return constantTimeEqual(k, await portalKey());
}

async function tokenRequest(params: Record<string, string>) {
  const body = new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, ...params });
  const r = await fetch(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`token ${r.status}: ${j.error ?? ""} ${j.error_description ?? ""}`);
  return j as { access_token: string; refresh_token?: string; expires_in: number };
}

async function me(access: string): Promise<{ upn: string; name: string }> {
  const r = await fetch("https://graph.microsoft.com/v1.0/me?$select=userPrincipalName,mail,displayName", {
    headers: { authorization: `Bearer ${access}` },
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`graph /me ${r.status}: ${j.error?.message ?? ""}`);
  return { upn: String(j.mail ?? j.userPrincipalName ?? "").toLowerCase(), name: String(j.displayName ?? "") };
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const route = url.pathname.replace(/^.*\/ms-auth/, "") || "/";

  if (!TENANT || !CLIENT_ID || !CLIENT_SECRET || !MAILBOX) {
    const missing = [
      !TENANT && "MS_TENANT_ID", !CLIENT_ID && "MS_CLIENT_ID", !CLIENT_SECRET && "MS_CLIENT_SECRET", !MAILBOX && "MS_MAILBOX",
    ].filter(Boolean).join(", ");
    return html(`Missing Edge secrets: ${missing}`, 500);
  }

  try {
    if (route === "/start") {
      if (!(await gated(url))) return html("Not authorized.", 401);
      const ts = String(Date.now());
      const state = `${ts}.${await hmac(await portalKey(), ts)}`;
      const auth = new URL(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/authorize`);
      auth.searchParams.set("client_id", CLIENT_ID);
      auth.searchParams.set("response_type", "code");
      auth.searchParams.set("redirect_uri", REDIRECT);
      auth.searchParams.set("response_mode", "query");
      auth.searchParams.set("scope", SCOPES);
      auth.searchParams.set("state", state);
      auth.searchParams.set("prompt", "select_account");
      auth.searchParams.set("login_hint", MAILBOX);
      return Response.redirect(auth.toString(), 302);
    }

    if (route === "/callback") {
      const err = url.searchParams.get("error");
      if (err) {
        const desc = url.searchParams.get("error_description") ?? "";
        return html(`Microsoft declined the sign-in.<br><br><b>${err}</b><br>${desc.replace(/</g, "&lt;")}`, 400);
      }
      const code = url.searchParams.get("code") ?? "";
      const state = url.searchParams.get("state") ?? "";
      const [ts, sig] = state.split(".");
      if (!code || !ts || !sig) return html("Bad callback.", 400);
      if (Date.now() - Number(ts) > 15 * 60 * 1000) return html("Sign-in link expired. Start again.", 400);
      if (!constantTimeEqual(sig, await hmac(await portalKey(), ts))) return html("State mismatch.", 400);

      const tok = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: REDIRECT, scope: SCOPES });
      if (!tok.refresh_token) return html("Microsoft returned no refresh token (offline_access missing?).", 500);
      const who = await me(tok.access_token);
      if (who.upn !== MAILBOX) {
        return html(`Signed in as <b>${who.upn}</b>, but the portal mailbox is <b>${MAILBOX}</b>. Nothing stored. Sign out of Microsoft and start again with the right account.`, 400);
      }
      const { error } = await sb.rpc("set_ms_refresh_token", { p_token: tok.refresh_token });
      if (error) return html(`Could not store token: ${error.message}`, 500);
      return html(`Connected.<br><br>Mailbox <b>${who.upn}</b> (${who.name}) is now the portal's email channel.<br><br>You can close this tab.`);
    }

    if (route === "/status") {
      if (!(await gated(url))) return html("Not authorized.", 401);
      const { data, error } = await sb.rpc("get_ms_refresh_token");
      if (error || !data) return html("No mailbox connected yet.", 200);
      const tok = await tokenRequest({ grant_type: "refresh_token", refresh_token: String(data), scope: SCOPES });
      if (tok.refresh_token) await sb.rpc("set_ms_refresh_token", { p_token: tok.refresh_token });
      const who = await me(tok.access_token);
      return new Response(JSON.stringify({ ok: true, mailbox: who.upn, name: who.name, expires_in: tok.expires_in }), {
        headers: { "content-type": "application/json" },
      });
    }

    return html("ms-auth v1.0", 404);
  } catch (e) {
    return html(`Error: ${String((e as Error).message).replace(/</g, "&lt;")}`, 500);
  }
});
