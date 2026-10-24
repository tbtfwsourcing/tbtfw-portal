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
        crm/demo.ts               dev-only made-up queue for /leads?demo (never in the build)
        components/
          FloatField  ChipGroup  Toggle  Wordmark  Footer  ProgressLine
          portal/                 ChoiceScreen (home), BuyScreen (find any car), ShowroomScreen (car view),
                                  SideMenu (the slide-out showroom), AskSheet,
                                  SellCar / SellNumbers / SellPhotos / SellYou, Details and Done screens,
                                  and their parts: TopBar, Step, Dock, BottomSheet, VinField, PhotoSlots
          crm/                    DraftCard, LeadRow, LeadDetail, StageMark, Thread, Confirm, the three tabs
          ui/                     shadcn-svelte components (generated; edit freely, they are yours)
    static/                       favicon, apple-touch-icon, og.png (share image), manifest, robots, .nojekyll
    supabase/functions/           Edge Function sources (see below)
    supabase/sql/                 schema and Postgres functions
    docs/voice_prompt.txt         the drafting prompt (also editable live on the Voice tab)
    legacy/                       the previous single-file index.html / leads.html, for reference only

## Working locally

    npm install
    npm run dev          # http://127.0.0.1:5173  — CRM at /leads?k=PORTAL_KEY, or /leads?demo for made-up data
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
- Every draft on the CRM was written by the system and has **not** been sent. Send / Mark sent / Skip are the only
  ways a draft leaves the queue. With a channel off, Open in Messages (or Mail) hands the draft to the device
  prefilled; it still has to be marked sent by hand.
- One exception, by Garett's decision (Oct 24, 2026): a buyer's first answer goes out on its own when the car
  they asked for is in inventory, they gave an email, and the draft is clean (lead-enrich v1.6). It waits in the
  queue as `approved` for five minutes with Send now / Cancel, then lead-enrich sends it through lead-crm.
  A car we do not have is always a draft for approval, written as a confident sourcing deal.
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
- `static/og.png` is the 1200×630 image shown when the link is texted or posted. Replace it with a photographed
  one whenever there is a better asset; keep the size.

## Edge Functions

    ms-auth/            Microsoft sign-in for garett@tbtfw.com (v6)
    lead-intake/        intake API, dedupe, Turnstile, photo uploads (v1.4, deployed version 11)
    lead-enrich/        every 2 min: grading, inventory-aware drafts, in-stock auto-email (v1.6, deployed version 12)
    lead-crm/           backend for the CRM; Graph email send, Supabase Auth gate, cancel (v1.5, deployed version 13)
    lead-inbox/         odd minutes: polls the Outlook inbox for replies (v1.0, deployed version 2)
    inventory-sync/     hourly mirror of tbtfw.com inventory (v1.1, deployed version 8)
    spec-inference/     Haiku grader, shared with the board; lead mode (v2.7, deployed version 14)

All seven portal functions are in this repo, copied from what was deployed on Oct 24, 2026. The sourcing
board's functions (board, *-ingest, auto-verdict, pushover-alerts, ilusso-sitemap-join) live only in Supabase.
Redeploy with the full file (never a stub) from the dashboard, the Supabase MCP, or
`supabase functions deploy <name> --project-ref qymkzfhdneukffeilrhx`. verify_jwt: `lead-intake`, `lead-crm`,
`ms-auth` OFF (they gate themselves); the rest ON. No secrets live in these files; they read
`Deno.env` and Vault at runtime.

## Never commit

Any key or token. The pages contain only public values: the function URLs and the Turnstile site key.
