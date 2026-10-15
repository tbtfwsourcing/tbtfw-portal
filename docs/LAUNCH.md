# Launch plan — SvelteKit portal

The rebuild is done and verified locally (typecheck clean, production build green, clicked through at phone and
desktop widths). What remains is wiring it to GitHub, a short hardening pass, the live switch, and a smoke test.

Owners: **YOU** = Garett / repo owner. **ME** = Claude in this session. Each phase has a gate; the next phase
does not start until the gate passes.

---

## Phase 0 — Connect to GitHub  (YOU, 3 min)  ← blocks everything below

- [ ] In your own terminal: `gh auth login` → GitHub.com → HTTPS → login with a browser. (Only you can do this.)
- [ ] Tell me the name + email to put on commits.
- [ ] ME: add the remote, fetch, rebase the work onto `origin/main`, commit.

**Gate:** `git remote -v` shows `tbtfwsourcing/tbtfw-portal`; one commit on top of `origin/main`.

## Phase 1 — Pre-launch hardening  (ME, ~1 hour, no decisions needed)

Quick wins that reduce the chance of a bad first lead:

- [ ] "Asking about: 2022 // Chiron // Super Sport" pinned above the submit button
- [ ] "Sending…" state and photo upload progress on submit
- [ ] Loading skeletons for inventory and the CRM queue
- [ ] Old pages published at `/legacy/index.html` and `/legacy/leads.html` as a fallback bookmark
- [ ] `sitemap.xml`

**Gate:** `npm run check` 0 errors 0 warnings · `npm run build` clean · re-verified in the browser.

## Phase 2 — Go live  (YOU first, then ME, 10 min)

- [ ] **YOU, BEFORE ANY PUSH:** GitHub → repo → **Settings → Pages → Build and deployment → Source: GitHub Actions.**
      The old mode serves the repo root; `index.html` no longer lives there. Push first and the site goes dark.
- [ ] YOU: say "ship it".
- [ ] ME: push to `main`. The Action runs check → build → deploy, about 2 minutes. I watch it with `gh run watch`.

**Gate:** https://tbtfwsourcing.github.io/tbtfw-portal/ and `/leads.html` load.
**From here on, every push to `main` deploys itself.**

## Phase 3 — Live smoke test  (YOU, 10 min — must be the live URL; Turnstile is locked to the domain)

- [ ] Buy: pick a car, name `TEST DELETE`, your own phone and email → a reference number appears
- [ ] Within 2 minutes it shows in the CRM Queue with a draft → **Skip** the draft → set stage **junk**
- [ ] Sell: a VIN of a car you own, 3 photos, any price → reference number → same cleanup
- [ ] CRM: open a lead, change its stage, save a note, open Voice
- [ ] Text yourself the link → the preview card shows
- [ ] On your phone: hard-refresh, run Buy once from the showroom floor

**Rollback if anything fails:** bookmark `/legacy/leads.html?k=…` and tell me. `git revert` restores the old site
in two minutes.

## Phase 4 — Same-day polish  (ME, after Phase 3 is green)

- [ ] Phone auto-formats as you type; email and phone validate on blur
- [ ] CRM draft cards: clean action row on phones
- [ ] CRM refresh button and "updated 40s ago"
- [ ] Desktop inventory: two rows + "Show all"

## Phase 5 — Needs your input, no code without it

- [ ] Footer phone / address / hours → `src/lib/config.ts` (`SITE`)
- [ ] Logo as SVG → `static/favicon.svg`
- [ ] A photographed share image, 1200×630 → `static/og.png`
- [ ] Analytics account (Plausible or GA) if you want traffic numbers

## Later

- Microsoft sign-in (`ms-auth` already exists) replacing the `?k=` key in the bookmark
- Error monitoring (Sentry)
- CRM features parked earlier: swipe to approve, inline-edit tracking, metrics
