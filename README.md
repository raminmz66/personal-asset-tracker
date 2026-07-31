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
