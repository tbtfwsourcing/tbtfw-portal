// TBTFW — LEAD WATCHDOG — Edge Function v1.0 (Oct 24, 2026)
// Makes sure Garett hears about it when the lead pipeline breaks, instead of finding out
// from a lead gone cold. Runs every five minutes from pg_cron (anon bearer, verify_jwt ON,
// like the other jobs) and judges OUTCOMES, not just whether jobs ran:
//   lead_unalerted  a real lead (not duplicate/junk) ready 15+ min with no push   CRITICAL
//   push_failed     Pushover rejected a lead alert in the last 30 min            CRITICAL
//   mailbox         lead-inbox reports the Outlook (Graph) connection broken     CRITICAL
//   jobs_failing    5+ background calls failed in 15 min (gateway, timeout, ok:false) CRITICAL
//   cron:<job>      an active pg_cron job errored or is 3x its usual gap late     CRITICAL
//   probe:<name>    the intake API, inventory, CRM API or the site itself is down
//                   (two runs in a row, so one blip never pages)                    CRITICAL
//   ai_stuck        a ready lead still has no AI draft after 20 min                WARNING
//   ai_gave_up      the AI gave up on a lead in the last day (no draft)            WARNING
//   inventory       no live inventory, or last synced 3+ hours ago                 WARNING
// Signals come from one RPC, public.watchdog_signals() (service_role only); probes are
// plain HTTP. One Pushover per run lists what is NEW (priority 1 if anything critical);
// an open problem repeats every 2 h (critical) / 12 h (warning); a quiet "resolved" follows
// the fix. State lives in portal_kv 'watchdog_state'. Pushes carry lead refs, never names.
// Independent channel: if WATCHDOG_HEARTBEAT_URL is set (a healthchecks.io ping URL), every
// run pings it, and pings <url>/fail when something critical is open or Pushover failed, so
// a dead Supabase, a stopped cron or a broken Pushover still reaches Garett by email.
// Body: {"dry_run": true} = judge and report, no push, no state, no heartbeat.
//       {"test": true}    = send one test push to prove delivery.
// Secrets: SUPABASE_SERVICE_ROLE_KEY (platform); PUSHOVER_APP_TOKEN / PUSHOVER_USER_KEY (env
//   first, Vault RPC get_pushover_keys fallback); WATCHDOG_HEARTBEAT_URL, PORTAL_SITE_URL,
//   PORTAL_LEADS_URL (optional).

type Json = Record<string, unknown>;
type Severity = "critical" | "warning";
interface Issue { key: string; severity: Severity; title: string; detail: string }
interface Open { severity: Severity; title: string; first_seen: string; last_alert: string | null }
interface State { v: 1; open: Record<string, Open>; probe_fails: Record<string, number>; last_run?: string; last_push_error?: string | null; last_test?: string }

const STATE_KEY = "watchdog_state";
const REALERT_MS: Record<Severity, number> = { critical: 2 * 3600_000, warning: 12 * 3600_000 };
const PROBE_TIMEOUT_MS = 10_000;
const PROBE_FAILS_TO_ALERT = 2;
const HTTP_FAILURES_TO_ALERT = 5;
const INVENTORY_STALE_HOURS = 3;
const MAX_LINES = 5;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
function list(items: string[]): string {
  return items.slice(0, MAX_LINES).join(", ") + (items.length > MAX_LINES ? " +" + (items.length - MAX_LINES) + " more" : "");
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!SUPABASE_URL || !SERVICE_KEY) return json({ ok: false, error: "platform env missing" }, 500);
  const SITE_URL = (Deno.env.get("PORTAL_SITE_URL") || "https://concierge.tbtfw.com/").replace(/\/?$/, "/");
  const LEADS_URL = Deno.env.get("PORTAL_LEADS_URL") || SITE_URL + "leads.html";
  const HEARTBEAT_URL = (Deno.env.get("WATCHDOG_HEARTBEAT_URL") || "").replace(/\/+$/, "");

  const REST = SUPABASE_URL + "/rest/v1";
  const FN = SUPABASE_URL + "/functions/v1";
  const SB: Record<string, string> = { apikey: SERVICE_KEY, Authorization: "Bearer " + SERVICE_KEY, "Content-Type": "application/json" };
  const body = await req.json().catch(() => ({})) as Json;
  const dryRun = body.dry_run === true;
  const now = new Date();

  async function rpc(name: string): Promise<unknown> {
    const r = await fetch(REST + "/rpc/" + name, { method: "POST", headers: SB, body: "{}" });
    if (!r.ok) throw new Error("rpc " + name + " " + r.status + ": " + (await r.text()).slice(0, 200));
    return await r.json();
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
  // Returns "" on success, else the reason.
  async function push(title: string, message: string, priority: number): Promise<string> {
    try {
      const keys = await pushoverKeys();
      if (!keys) return "Pushover keys unavailable";
      const form = new URLSearchParams({ token: keys.token, user: keys.user, title, message, priority: String(priority), url: LEADS_URL, url_title: "Open leads" });
      const r = await fetch("https://api.pushover.net/1/messages.json", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form.toString() });
      const d = await r.json().catch(() => ({}));
      return r.ok && d.status === 1 ? "" : "Pushover " + r.status + " " + JSON.stringify(d).slice(0, 200);
    } catch (e) {
      return "Pushover " + String((e as Error).message || e).slice(0, 200);
    }
  }

  // ---- state ------------------------------------------------------------------
  let state: State = { v: 1, open: {}, probe_fails: {} };
  try {
    const r = await fetch(REST + "/portal_kv?key=eq." + STATE_KEY + "&select=value&limit=1", { headers: SB });
    const rows = r.ok ? await r.json() : [];
    const v = Array.isArray(rows) && rows.length ? rows[0].value as State : null;
    if (v && v.v === 1) state = { ...state, ...v, open: v.open || {}, probe_fails: v.probe_fails || {} };
  } catch (_e) { /* start fresh */ }
  async function saveState(s: State): Promise<void> {
    try {
      await fetch(REST + "/portal_kv", {
        method: "POST",
        headers: { ...SB, Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ key: STATE_KEY, value: s, updated_at: now.toISOString() }),
      });
    } catch (_e) { /* next run re-judges from scratch */ }
  }

  // One test push per 10 minutes at most, so the endpoint can never be used to spam the phone.
  if (body.test === true) {
    if (state.last_test && now.getTime() - Date.parse(state.last_test) < 10 * 60_000) return json({ ok: false, test: true, error: "test sent recently" }, 429);
    const err = await push("TBTFW WATCHDOG // test", "The lead alarm is connected. You will hear from it here if leads stop reaching you.", 0);
    await saveState({ ...state, last_test: now.toISOString() });
    return json({ ok: !err, test: true, error: err || undefined });
  }

  // ---- probes (in parallel with the signals query) ---------------------------------
  async function probe(url: string, accept: (status: number, text: string) => boolean): Promise<{ ok: boolean; why: string }> {
    try {
      const r = await fetch(url, { headers: { "User-Agent": "TBTFW-watchdog/1.0" }, signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
      const text = await r.text();
      return accept(r.status, text) ? { ok: true, why: "" } : { ok: false, why: "HTTP " + r.status };
    } catch (e) {
      return { ok: false, why: String((e as Error).name === "TimeoutError" ? "no answer in 10 s" : (e as Error).message || e).slice(0, 80) };
    }
  }
  const hasJson = (text: string, test: (d: Json) => boolean) => { try { return test(JSON.parse(text)); } catch { return false; } };
  const PROBES: Record<string, { label: string; run: () => Promise<{ ok: boolean; why: string }> }> = {
    intake: { label: "Lead form backend", run: () => probe(FN + "/lead-intake/health", (s, t) => s === 200 && hasJson(t, (d) => d.ok === true)) },
    inventory_api: { label: "Inventory feed", run: () => probe(FN + "/lead-intake/inventory", (s, t) => s === 200 && hasJson(t, (d) => d.ok === true && Number(d.count) > 0)) },
    // A wrong key must be refused with lead-crm's own JSON: proves the CRM backend boots.
    crm_api: { label: "CRM backend", run: () => probe(FN + "/lead-crm/queue?k=watchdog-probe", (s, t) => s === 401 && hasJson(t, (d) => d.ok === false && typeof d.error === "string")) },
    site: { label: "Customer website", run: () => probe(SITE_URL, (s) => s === 200) },
    crm_page: { label: "CRM page", run: () => probe(SITE_URL + "leads.html", (s) => s === 200) },
  };
  const [signalsRes, ...probeRes] = await Promise.allSettled([rpc("watchdog_signals"), ...Object.values(PROBES).map((p) => p.run())]);

  // ---- judge --------------------------------------------------------------------------
  const issues: Issue[] = [];
  const add = (key: string, severity: Severity, title: string, detail: string) => issues.push({ key, severity, title, detail });

  if (signalsRes.status === "rejected") {
    add("database", "critical", "Database check failed", String(signalsRes.reason?.message || signalsRes.reason).slice(0, 160));
  } else {
    const s = signalsRes.value as Json;
    const arr = (k: string) => (Array.isArray(s[k]) ? s[k] as Json[] : []);
    const obj = (k: string) => (s[k] && typeof s[k] === "object" ? s[k] as Json : {});

    const unalerted = arr("unalerted");
    if (unalerted.length) {
      add("lead_unalerted", "critical", unalerted.length + (unalerted.length === 1 ? " lead never reached your phone" : " leads never reached your phone"),
        list(unalerted.map((l) => l.ref + " (" + l.kind + ", " + l.minutes + " min)")) + ". They are in the CRM.");
    }
    const pf = obj("push_failed");
    if (Number(pf.count) > 0) add("push_failed", "critical", "Lead alerts are failing", Number(pf.count) + " in 30 min: " + (pf.last_error || "unknown error"));
    const mb = obj("mailbox");
    if (Number(mb.count) > 0) add("mailbox", "critical", "Outlook connection is down", "Replies are not landing and emails cannot send. " + String(mb.sample || "").slice(0, 120));
    const hf = obj("http_failures");
    if (Number(hf.count) >= HTTP_FAILURES_TO_ALERT) add("jobs_failing", "critical", "Background jobs are failing", Number(hf.count) + " failed calls in 15 min: " + String(hf.sample || "").slice(0, 120));
    for (const c of arr("cron")) {
      add("cron:" + c.job, "critical", "Background job " + c.job + " " + (Number(c.failed) > 0 ? "is erroring" : "has stopped"),
        Number(c.failed) > 0 ? String(c.error || "") : "last ran " + c.minutes_since + " min ago");
    }
    const stuck = arr("unenriched");
    if (stuck.length) {
      add("ai_stuck", "warning", "AI drafts are stuck", list(stuck.map((l) => String(l.ref))) + (stuck[0].error ? ". " + String(stuck[0].error) : ""));
    }
    const gaveUp = arr("gave_up");
    if (gaveUp.length) add("ai_gave_up", "warning", "AI could not draft " + gaveUp.length + (gaveUp.length === 1 ? " lead" : " leads"), list(gaveUp.map((l) => String(l.ref))) + ". " + String(gaveUp[0].error || ""));
    const inv = obj("inventory");
    const last = (inv.last_sync && typeof inv.last_sync === "object" ? inv.last_sync : {}) as Json;
    if (Number(inv.active) === 0 || Number(inv.hours_since) >= INVENTORY_STALE_HOURS) {
      add("inventory", "warning", "Inventory is not syncing", (Number(inv.active) === 0 ? "No live cars in the picker" : "Last synced " + inv.hours_since + " h ago") + (last.ok === false && last.error ? ". " + String(last.error).slice(0, 120) : ""));
    }
  }

  const probeNames = Object.keys(PROBES);
  const probeSummary: Record<string, boolean> = {};
  probeNames.forEach((name, i) => {
    const r = probeRes[i];
    const res = r.status === "fulfilled" ? r.value as { ok: boolean; why: string } : { ok: false, why: "probe crashed" };
    probeSummary[name] = res.ok;
    state.probe_fails[name] = res.ok ? 0 : (state.probe_fails[name] || 0) + 1;
    if (!res.ok && state.probe_fails[name] >= PROBE_FAILS_TO_ALERT) add("probe:" + name, "critical", PROBES[name].label + " is down", res.why);
  });

  // ---- diff against what Garett already knows -----------------------------------------
  const nowIso = now.toISOString();
  const current = new Map(issues.map((i) => [i.key, i]));
  const toAlert = issues.filter((i) => {
    const o = state.open[i.key];
    return !o || !o.last_alert || now.getTime() - Date.parse(o.last_alert) >= REALERT_MS[i.severity];
  });
  const resolved = Object.keys(state.open).filter((k) => !current.has(k));

  if (dryRun) {
    return json({ ok: true, dry_run: true, issues, would_alert: toAlert.map((i) => i.key), would_resolve: resolved, probes: probeSummary });
  }

  let pushError = "";
  if (toAlert.length) {
    const critical = toAlert.some((i) => i.severity === "critical");
    const title = "TBTFW ALERT // " + (toAlert.length === 1 ? toAlert[0].title : toAlert.length + " problems");
    const lines = toAlert.map((i) => (toAlert.length > 1 ? "• " + i.title + ": " : "") + i.detail + (state.open[i.key] ? " (still open)" : ""));
    pushError = await push(title, lines.join("\n").slice(0, 1000), critical ? 1 : 0);
  }
  if (resolved.length && !pushError) {
    const err = await push("TBTFW // resolved", resolved.map((k) => "✓ " + state.open[k].title).join("\n").slice(0, 1000), -1);
    if (err) pushError = err;
  }

  // ---- save state: only mark alerts as delivered when the push went through --------------
  const open: Record<string, Open> = {};
  for (const i of issues) {
    const prev = state.open[i.key];
    const alertedNow = toAlert.includes(i) && !pushError;
    open[i.key] = { severity: i.severity, title: i.title, first_seen: prev?.first_seen || nowIso, last_alert: alertedNow ? nowIso : (prev?.last_alert || null) };
  }
  if (pushError) for (const k of resolved) open[k] = state.open[k]; // retry the resolved notice next run
  await saveState({ v: 1, open, probe_fails: state.probe_fails, last_run: nowIso, last_push_error: pushError || null, last_test: state.last_test });
  if (toAlert.length || resolved.length) {
    try {
      await fetch(REST + "/lead_events", {
        method: "POST",
        headers: { ...SB, Prefer: "return=minimal" },
        body: JSON.stringify({ lead_id: null, event: "watchdog_alert", payload: { alerted: toAlert.map((i) => i.key), resolved, push_error: pushError || null } }),
      });
    } catch (_e) { /* never block */ }
  }

  // ---- heartbeat: the channel that still works when Supabase or Pushover does not --------
  const criticalOpen = issues.some((i) => i.severity === "critical");
  if (HEARTBEAT_URL) {
    try {
      const failing = criticalOpen || !!pushError;
      const note = failing ? issues.filter((i) => i.severity === "critical").map((i) => i.title).concat(pushError ? ["Pushover: " + pushError] : []).join("; ") : "ok";
      await fetch(HEARTBEAT_URL + (failing ? "/fail" : ""), { method: "POST", body: note.slice(0, 500), signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    } catch (_e) { /* healthchecks.io alerts on the missed ping anyway */ }
  }

  return json({ ok: true, v: "1.0", open: issues.map((i) => ({ key: i.key, severity: i.severity })), alerted: toAlert.map((i) => i.key), resolved, pushed: toAlert.length > 0 && !pushError, push_error: pushError ? "push failed" : undefined, probes: probeSummary });
});
