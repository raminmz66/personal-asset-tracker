# Personal Asset Custody Tracker

Personal “external memory” for assets you hold on behalf of other people — who owns what, what is still in custody, what was returned, and the history of changes.

This is **not** accounting or personal finance software. It is a small, fast, single-user app optimized for answering custody questions in seconds.

## Status

Early design. Architecture and data model are drafted; UI/UX and frontend framework are not locked yet.

## Docs

- [Product requirements (PRD)](docs/PRD.md)
- [Architecture & data design](docs/superpowers/specs/2026-07-30-personal-asset-custody-tracker-design.md)

## Planned stack (infra)

- **Client:** Mobile-first PWA (Persian / RTL)
- **Host / API:** Cloudflare Pages + Workers
- **Database:** Cloudflare D1 (source of truth)
- **Offline:** Local cache + write queue
- **Auth:** Single password / PIN
- **Portability:** JSON export / import

Frontend framework and styling are deferred until after UI/UX design.

## License

Not chosen yet.
