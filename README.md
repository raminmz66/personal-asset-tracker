# Personal Asset Custody Tracker

Personal “external memory” for assets you hold on behalf of other people — who owns what, what is still in custody, what was returned, and the history of changes.

This is **not** accounting or personal finance software. It is a small, fast, single-user app optimized for answering custody questions in seconds.

## Status

Design complete (architecture + UI). Implementation plan ready.

## Docs

- [Product requirements (PRD)](docs/PRD.md)
- [Architecture & data design](docs/superpowers/specs/2026-07-30-personal-asset-custody-tracker-design.md)
- [UI/UX design](docs/superpowers/specs/2026-07-31-personal-asset-custody-tracker-ui-design.md)
- [Implementation plan](docs/superpowers/plans/2026-07-31-personal-asset-custody-tracker.md)

## Stack (locked)

- **Client:** Mobile-first Persian RTL PWA (React + Vite), Calm notebook UI, Vazirmatn, Jalali dates in UI
- **API:** Hono on Cloudflare Workers
- **Database:** Cloudflare D1
- **Offline:** Local snapshot cache + ordered write queue
- **Auth:** Password / PIN, ~30-day session cookie
- **Portability:** JSON export / import (replace-all)
- **Config:** `wrangler.jsonc` (not TOML)

## License

Not chosen yet.
