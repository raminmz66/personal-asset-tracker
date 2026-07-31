# Personal Asset Custody Tracker

Personal “external memory” for **money** you hold on behalf of other people — who owns what balances, what remains, what was returned, and the history of changes.

This is **not** accounting software, and **not** a tool/inventory tracker. v1 is money only (تومان، USDT، currencies, …).

## Status

Design complete (architecture + UI, money-only). Implementation plan ready.

## Docs

- [Product requirements (PRD)](docs/PRD.md)
- [Architecture & data design](docs/superpowers/specs/2026-07-30-personal-asset-custody-tracker-design.md)
- [UI/UX design](docs/superpowers/specs/2026-07-31-personal-asset-custody-tracker-ui-design.md)
- [Implementation plan](docs/superpowers/plans/2026-07-31-personal-asset-custody-tracker.md)
- [UI mockups (money-only)](docs/superpowers/mockups/)

## Development

```bash
npm install
npm test              # run @pat/domain tests
npm run test:all      # run tests in all workspaces
```

### Local dev (API + web)

Run in two terminals:

```bash
npm run dev:api   # Hono Worker on http://127.0.0.1:8787 (Wrangler + local D1)
npm run dev:web   # Vite on http://localhost:5173 — proxies /api to the Worker
```

Copy `apps/api/.dev.vars.example` to `apps/api/.dev.vars` and set `SESSION_SECRET` for local auth.

## Deploy (Cloudflare)

Requires a Cloudflare account, `wrangler login`, and a custom domain (or `*.pages.dev` + Worker route on the same hostname).

### 1. D1 database

From `apps/api`:

```bash
wrangler d1 create pat-db
```

Copy the returned `database_id` into `apps/api/wrangler.jsonc` (replace `local-dev-placeholder`).

Apply migrations:

```bash
wrangler d1 migrations apply pat-db --remote
```

### 2. API Worker secrets & deploy

From `apps/api`:

```bash
wrangler secret put SESSION_SECRET   # long random string for session signing
npm run deploy
```

Note the Worker URL (e.g. `personal-asset-tracker-api.<account>.workers.dev`).

### 3. Pages (PWA frontend)

From `apps/web`:

```bash
npm run deploy   # build + wrangler pages deploy dist
```

On first deploy, Wrangler creates the Pages project `personal-asset-tracker-web`.

`public/_routes.json` excludes `/api` and `/api/*` so those paths are not served as static files.

### 4. Route `/api` to the Worker

In the Cloudflare dashboard (**Workers & Pages → your API Worker → Settings → Domains & Routes**), add a route on your Pages hostname:

- Pattern: `your-app.pages.dev/api/*` (or your custom domain)
- Worker: `personal-asset-tracker-api`

The SPA calls `/api/...` on the same origin; Pages serves the app, the Worker handles API requests.

### 5. Verify PWA

Open the Pages URL on a phone → browser “Add to Home Screen”. Manifest name: **امانت‌ها**; theme `#0f6b6b`, background `#f4efe6`.

## Stack (locked)

- **Client:** Mobile-first Persian RTL PWA (React + Vite), Calm notebook UI, Vazirmatn, Jalali dates
- **API:** Hono on Cloudflare Workers
- **Database:** Cloudflare D1 (people → balances → deposit/return txs)
- **Offline:** Snapshot cache + ordered write queue
- **Auth:** Password / PIN, ~30-day session cookie
- **Portability:** JSON export / import (replace-all)
- **Config:** `wrangler.jsonc`

## License

Not chosen yet.
