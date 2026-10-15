# TBTFW Portal

The customer intake portal (Buy / Sell / Trade) and the CRM behind it, for TBTFW in Beverly Hills.

- **Live:** https://tbtfwsourcing.github.io/tbtfw-portal/ (GitHub Pages, deployed from `main` by Actions)
- **CRM:** `leads.html?k=PORTAL_KEY` on the same host. The key lives in Supabase Vault and your bookmark, nowhere else.
- **Backend:** Supabase project `qymkzfhdneukffeilrhx` — Edge Functions, Postgres, pg_cron, Vault, Storage.
- **Docs:** the "AI Automotive Assistant" Claude project (build handoffs, design contract, ledger).

## Stack

SvelteKit 3 (static, prerendered) · Svelte 5 · Tailwind v4 · shadcn-svelte · TypeScript. Node 22+.

Every page is static HTML that talks to the Edge Functions from the browser. There is no server of our own.

## Layout

    src/
      app.css                     design tokens (black / white / hairline / bone) mapped onto shadcn's variables
      app.html                    document shell
      routes/
        +page.svelte              the portal: choice → buy | sell (2 steps) → sent
        leads/+page.svelte        the CRM: Queue / Leads / Voice — built to leads.html
        +error.svelte             branded 404 (adapter-static writes 404.html for Pages)
      lib/
        config.ts                 API URLs, Turnstile site key, photo limits, SITE (footer contact, canonical URL)
        format.ts  vin.ts  images.ts
        api/intake.ts             lead-intake client (inventory, create lead, uploads, details)
        api/crm.ts                lead-crm client (queue, voice, send / mark / skip, stage, notes, owner)
        portal/state.svelte.ts    the intake session: mode, forms, photos, results; shallow-routed screens
        portal/turnstile.ts       invisible Turnstile
        crm/state.svelte.ts       the CRM session: key, queue data, tab, filters
        components/
          FloatField  ChipGroup  Toggle  Rail  Wordmark  Footer  ProgressLine
          portal/                 ChoiceScreen, InventoryPicker, VinField, PhotoSlots, Buy/Sell/Details/Done screens
          crm/                    DraftCard, LeadRow, Thread, LeadChips, Chip, Confirm, the three tabs
          ui/                     shadcn-svelte components (generated; edit freely, they are yours)
    static/                       favicon, apple-touch-icon, og.png (share image), manifest, robots, .nojekyll
    supabase/functions/           Edge Function sources (see below)
    supabase/sql/                 schema and Postgres functions
    docs/voice_prompt.txt         the drafting prompt (also editable live on the Voice tab)
    legacy/                       the previous single-file index.html / leads.html, for reference only

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
  `border-hair`, `text-bone` and friends, not from literal hex values.
- Before you ship a visual change, look at it at 390px wide. Most leads come from a phone.

## Footer and share card

- `SITE.phone`, `SITE.address`, `SITE.hours` in `lib/config.ts` are empty; fill them to show them in the footer.
- `static/og.png` is the 1200×630 image shown when the link is texted or posted. Replace it with a photographed
  one whenever there is a better asset; keep the size.

## Edge Functions

    ms-auth/            Microsoft sign-in for garett@tbtfw.com (source included)
    lead-intake/        intake API, dedupe, Turnstile, photo uploads
    lead-enrich/        every 2 min: grading, voice drafts, follow-ups, replies
    lead-crm/           backend for the CRM; Graph email send
    lead-inbox/         odd minutes: polls the Outlook inbox for replies
    inventory-sync/     hourly mirror of tbtfw.com inventory
    spec-inference/     Haiku grader, shared with the board; lead mode

Only `ms-auth` is in this repo. Download the others from the Supabase dashboard (Edge Functions → the function
→ Code → download) into `supabase/functions/<name>/index.ts`. Redeploy from the dashboard or with
`supabase functions deploy <name> --project-ref qymkzfhdneukffeilrhx`. verify_jwt: `lead-intake`, `lead-crm`,
`ms-auth` OFF (they gate themselves); the rest ON.

## Never commit

Any key or token. The pages contain only public values: the function URLs and the Turnstile site key.
