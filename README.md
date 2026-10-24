# TBTFW Portal

The customer intake portal (Buy / Sell / Trade) and the CRM behind it, for TBTFW in Beverly Hills.

- **Live:** https://tbtfwsourcing.github.io/tbtfw-portal/ (GitHub Pages, deployed from `main` by Actions)
- **CRM:** `leads.html` on the same host. Sign in with your @tbtfw.com email: a one-time code arrives by email
  (Supabase Auth, no password). `lead-crm` only admits sessions on that domain (`CRM_ALLOWED_DOMAIN`, or an
  explicit `CRM_ALLOWED_EMAILS` list) and records the signed-in email on every lead event. The old
  `?k=PORTAL_KEY` bookmark still works until `CRM_LEGACY_KEY=off` is set on the function.
  Public sign-ups are off in Supabase, so only existing accounts get a code. To add someone: Supabase →
  Authentication → Users → Add user → Create new user, with their @tbtfw.com email, "Auto Confirm User"
  ticked and any long random password (nobody uses it). They then sign in with a code like everyone else.
- **Backend:** Supabase project `qymkzfhdneukffeilrhx` — Edge Functions, Postgres, pg_cron, Vault, Storage.
- **Docs:** the "AI Automotive Assistant" Claude project (build handoffs, design contract, ledger).

## Stack

SvelteKit 3 (static, prerendered) · Svelte 5 · Tailwind v4 · shadcn-svelte · TypeScript. Node 22+.

Every page is static HTML that talks to the Edge Functions from the browser. There is no server of our own.

## Layout

    src/
      app.css                     design tokens (warm black / ivory / hairline / bone) mapped onto shadcn's variables
      app.html                    document shell
      routes/
        +page.svelte              the portal: home → find any car (+ showroom car view, side menu, ask sheet)
                                  | sell (4 one-question steps) → sent
        leads/+page.svelte        the CRM: Queue / Leads / Voice — built to leads.html
        +error.svelte             branded 404 (adapter-static writes 404.html for Pages)
      lib/
        config.ts                 API URLs, Turnstile site key, photo limits, SITE (footer contact, canonical URL)
        format.ts  vin.ts  images.ts
        api/intake.ts             lead-intake client (inventory, create lead, uploads, details)
        api/crm.ts                lead-crm client (queue, voice, send / mark / skip, stage, notes, owner)
        portal/state.svelte.ts    the intake session: mode, forms, photos, results; shallow-routed screens and sheets
        portal/photos.svelte.ts   which inventory photos are real (the CDN's "Coming soon" card is never shown)
        portal/turnstile.ts       invisible Turnstile
        crm/state.svelte.ts       the CRM session: key, queue data, tab, filters
        components/
          FloatField  ChipGroup  Toggle  Wordmark  Footer  ProgressLine
          portal/                 ChoiceScreen (home), BuyScreen (find any car), ShowroomScreen (car view),
                                  SideMenu (the slide-out showroom), AskSheet,
                                  SellCar / SellNumbers / SellPhotos / SellYou, Details and Done screens,
                                  and their parts: TopBar, Step, Dock, BottomSheet, VinField, PhotoSlots
          crm/                    DraftCard, LeadRow, Thread, LeadChips, Chip, Confirm, the three tabs
          ui/                     shadcn-svelte components (generated; edit freely, they are yours)
    static/                       favicon, apple-touch-icon, og.jpg (link preview), manifest, robots, .nojekyll
    supabase/functions/           Edge Function sources (see below)
    supabase/sql/                 schema and Postgres functions
    docs/voice_prompt.txt         the drafting prompt (also editable live on the Voice tab)
    legacy/                       the previous single-file index.html / leads.html, for reference only
    scripts/og-preview/           the link preview's animation (anim.html) and its renderer (render.mjs)

## Working locally

    npm install
    npm run dev          # http://127.0.0.1:5173  — CRM at /leads?k=PORTAL_KEY
    npm run check        # svelte-check, must be clean before pushing
    npm run build        # static site into build/
    npm run preview      # serve build/

Both pages talk to the **live** backend. A local submit on the portal creates a REAL lead: use an obviously fake
name and delete it afterwards.

To mirror the Pages URL locally: `BASE_PATH=/tbtfw-portal npm run build`.

## Shipping

Push to `main`. The workflow in `.github/workflows/deploy.yml` runs `check`, builds with `BASE_PATH=/tbtfw-portal`,
and deploys `build/` to GitHub Pages. About two minutes end to end; hard-refresh (or a private tab) on a phone.

One-time repo setting: **Settings → Pages → Build and deployment → Source: GitHub Actions.**

## Rules that keep the pages working

- Customer and lead text is rendered through Svelte, which escapes it. Never pass user data through `{@html}`.
- Form field names and endpoints are the backend contract — see `lib/api/*.ts`. Change them with the function.
- Every draft on the CRM was written by the system and has **not** been sent. Send / Copy + Mark sent / Skip are
  the only ways a draft leaves the queue.
- The CRM reads its key from `?k=` at runtime and never stores it.
- Keep the design tokens in `app.css`. Components take their colour from `bg-foreground`, `text-mute`,
  `border-hair`, `text-bone` and friends, not from literal hex values. The palette matches tbtfw.com:
  black ground, soft white type, neutral hairlines, one warm bone accent.
- Type follows tbtfw.com: an extended grotesk for display, a grotesk for everything else. `disp` is
  Archivo at 118% width for headlines and the VIN identity; `disp-sm` is the same face at 108% for car
  names in cards and rows; `brand` is the 125% bold cut for the wordmark; `eyebrow`, `cta` and
  `section-head` (short bone rule + label) are Inter, tracked uppercase. Meta rows use `dots`.
- The house look lives inside the shadcn primitives in `lib/components/ui`, so reach for their variants
  before writing classes: `Button variant="house" | "hairline" | "quiet"` with `size="cta" | "house" |
  "house-sm"`, `Badge variant="solid" | "dim" | "accent"`, and `Input`, `Textarea`, `Checkbox`, `Card`,
  `Select`, `Skeleton` are square and hairline by default.
- Before you ship a visual change, look at it at 390px wide. Most leads come from a phone.

## Footer and share card

- `SITE.phone`, `SITE.address`, `SITE.hours` in `lib/config.ts` are empty; fill them to show them in the footer.
- The link preview is a still, `static/og.jpg` (`og:image`, 1200×630): the Chiron, the headline and the wordmark.
  Keep it a still. In iMessage a video (`og:video`) or an animated image opens full screen when tapped, and only
  the thin strip under it opens the site; both were tried and dropped. A still opens the site on any tap.
- To change the car, for example when it sells (needs Google Chrome):

      npm run og:preview -- --car 795008

  `--car` takes a stock id from the inventory feed or an inventory photo URL; with no argument it rebuilds the
  current one. It refuses a "Coming soon" card and rewrites `static/og.jpg` in a few seconds, drawn by
  `scripts/og-preview/anim.html` at its final frame.
- Then update `og:image:alt` in `routes/+page.svelte` to describe the new car (the script prints its name),
  and ship. iMessage caches previews by URL, so check with a fresh link, such as `?v=5` on the end.

## Edge Functions

    ms-auth/            Microsoft sign-in for garett@tbtfw.com (v6)
    lead-intake/        intake API, dedupe, Turnstile, photo uploads (v1.4, deployed version 11)
    lead-enrich/        every 2 min: grading, drafts, follow-ups, replies; emails each lead to Garett (v1.7)
    lead-crm/           backend for the CRM; Graph email send, Supabase Auth gate (v1.4, deployed version 12)
    lead-inbox/         odd minutes: polls the Outlook inbox for replies (v1.0, deployed version 2)
    inventory-sync/     hourly mirror of tbtfw.com inventory (v1.1, deployed version 8)
    spec-inference/     Haiku grader, shared with the board; lead mode (v2.7, deployed version 14)
    lead-watchdog/      every 5 min: pages Garett when the pipeline breaks (v1.0, see below)

All portal functions are in this repo, copied from what was deployed on Oct 24, 2026. The sourcing
board's functions (board, *-ingest, auto-verdict, pushover-alerts, ilusso-sitemap-join) live only in Supabase.
Redeploy with the full file (never a stub) from the dashboard, the Supabase MCP, or
`supabase functions deploy <name> --project-ref qymkzfhdneukffeilrhx`. verify_jwt: `lead-intake`, `lead-crm`,
`ms-auth` OFF (they gate themselves); the rest ON. No secrets live in these files; they read
`Deno.env` and Vault at runtime.

## Lead emails (lead-enrich v1.7)

Nothing is ever sent to a customer on its own: the AI's first reply waits in the queue for a tap (the v1.6
in-stock auto-email sits behind `AUTO_SEND = false`). Instead every lead is emailed to Garett
(`LEAD_EMAIL_TO`, default the portal mailbox) through Microsoft Graph right after the AI finishes: a one-line
summary, **Text / Call / Email / Open in CRM** buttons prefilled with the suggested reply, a copy-paste block of
the submission, and the AI notes. Leads the AI has not finished, and repeat submissions, are emailed by a
sweep after 10 minutes, so none is missed. Outlook strips `sms:` links, so Text goes through `static/text.html`,
which reads the number and message from the URL fragment (never sent to a server) and opens Messages. Resend one
lead's email: POST `{"lead_email_lead_id": "<uuid>", "force": true}` to lead-enrich.

## Alerts (lead-watchdog)

`lead-watchdog` runs every five minutes (pg_cron job `portal-lead-watchdog-5min`) and sends Garett a
Pushover alert when something stops working: a real lead that never reached the phone (15 min), Pushover
rejecting alerts, the Outlook connection failing, background jobs erroring or stopping, the intake API,
inventory feed, CRM API or site being down (two checks in a row), AI drafts stuck or given up, or inventory
not syncing for 3 h. It judges outcomes from one read-only RPC, `public.watchdog_signals()`
(service_role only; SQL in `supabase/sql/2026-10-24_watchdog_signals.sql`). One push per problem, repeated
every 2 h (critical) or 12 h (warning) while open, then a quiet "resolved". Pushes carry lead refs, never
customer names. State is `portal_kv` key `watchdog_state`.

- Check it without paging anyone: POST `{"dry_run": true}`. Prove delivery: POST `{"test": true}` (one per
  10 min). Easiest from SQL: `net.http_post` to the function with the same bearer the cron job uses.
- Optional second channel: set the function secret `WATCHDOG_HEARTBEAT_URL` to a healthchecks.io ping URL
  (period 5 min, grace 15 min). It then emails if Supabase, cron or Pushover itself is down.

## Never commit

Any key or token. The pages contain only public values: the function URLs and the Turnstile site key.
