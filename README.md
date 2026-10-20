# CashMine payback (practical task)

Expo (React Native) web app that shows exchange-fee payback balances and lets the user claim them.

**Live:** https://galushkovasiliy.github.io/cashmine-test/

## Run locally

```bash
npm install
npx expo start --web
```

Open the printed localhost URL (designed for ~390px phone width). On first open the app asks for your API token; it is stored only in this browser's localStorage. "Change token" on Home clears it, and any 401 returns to the token screen.

```bash
npm test            # unit tests (money, API client, claims, freshness, activity)
npx tsc --noEmit    # typecheck
npx expo export --platform web   # static build in dist/ (vercel.json / public/_redirects add SPA rewrites)
```

Deploy: every push to `main` runs `.github/workflows/pages.yml` (tests, then a web build with `EXPO_BASE_URL=/cashmine-test`, `404.html` as the SPA fallback) and publishes to GitHub Pages.

## What works

- **Balances (Home):** available / pending / claiming per asset, total available in USD with pending and claiming totals beside it, "updated Xs ago" from `asOf` (clock skew clamped, stale marker after 45s), loading, error + retry, pull-to-refresh / Refresh, auto-refresh every 15s.
- **Claim:** pick asset, type an amount (a comma is accepted as the decimal separator) or tap Max, see min/fee/receive, choose a destination, confirm in an in-app modal, then a status screen that polls until completed/failed. The status page survives reloads.
- **Safe submission:** one Idempotency-Key per confirmed claim, saved with the exact body before sending. Lost responses / 5xx / 504 show "Checking your claim…" and resend the same key + body until the server gives a definite answer.
- **Activity:** cursor pagination with "Load more", dedupe by id, refresh reloads the first page.
- **Money:** every amount is a BigInt in the asset's smallest unit; no JS numbers touch money.

## Layout

- `src/money/` – parsing, validation, fee/receive, exact USD maths, formatting (+ tests)
- `src/api/` – base URL (one place), typed client, error classification, retries, dedup
- `src/claims/` – claim intents (idempotency), submit loop, background polling, balance overlay
- `src/app/` – screens (expo-router)
- `ai-logs/` – AI conversation for this build (raw `.jsonl` + readable `.md`)

See [NOTES.md](NOTES.md) for decisions and known issues.
