# Personal Asset Custody Tracker — Architecture & Data Design

> **Status:** Approved (2026-07-30); **amended 2026-07-31** (UI complete; create-flow + session clarifications)  
> **Date:** 2026-07-30  
> **Source:** `docs/PRD.md` + brainstorming decisions  
> **Scope:** Architecture, data model, sync, auth, export/import, errors, testing  
> **UI/UX:** See [UI design](./2026-07-31-personal-asset-custody-tracker-ui-design.md) (Approved)

---

## 1. Goal

A very small, fast personal app that acts as **external memory** for assets held on behalf of other people.

Success means: when someone asks what you hold for them, you can answer confidently within seconds — without relying on memory.

This is **not** accounting, personal finance, portfolio tracking, or inventory ERP.

---

## 2. Constraints & decisions

| Topic | Decision |
|---|---|
| Users | Single user (owner only) |
| Scale | ~5–10 contacts, stable |
| Usage | ~2–3 times/month; must be immediate when used |
| Client | Mobile web / PWA (primary); desktop optional |
| Language | Persian (Farsi) UI only, RTL |
| Hosting | Cloudflare free tier preferred |
| Data | Cloud source of truth + offline cache |
| Auth | Simple password / PIN (no OAuth) |
| Session | HTTP-only cookie; **TTL ~30 days** (rare usage; personal device) |
| Backup | JSON export / import (no second cloud backup service) |
| Dates | Gregorian `YYYY-MM-DD` in API/DB/export; Jalali in UI (see UI spec) |
| Notifications | None |
| Soft delete / trash / archive | None — permanent delete |
| Audit / immutable ledger | None — edit and delete freely |

---

## 3. Architecture

```
┌─────────────────────┐
│  Persian RTL PWA    │  Cloudflare Pages
│  (local cache +     │
│   offline write Q)  │
└─────────┬───────────┘
          │ HTTPS
┌─────────▼───────────┐
│  Workers API        │  Auth + CRUD + export/import (Hono)
└─────────┬───────────┘
          │
┌─────────▼───────────┐
│  D1 (SQLite)        │  Source of truth
└─────────────────────┘
```

### Layers

- **PWA (Pages):** Answer-first UI per UI spec. Maintains last-known data cache and an offline write queue.
- **Workers API:** Session auth, domain validation, CRUD, export/import.
- **D1:** Authoritative store for people, assets, transactions. Enable foreign keys (`PRAGMA foreign_keys = ON`) so cascades work.

### Sync (v1)

- Online: all reads/writes go through the API to D1; client updates cache after success.
- Offline: reads from cache; writes enqueue locally; on reconnect flush in order, then refresh cache.
- Conflict rule: **last-write-wins** (acceptable for one primary user/device).

### Auth

- One password/PIN set by the owner.
- Successful login issues an HTTP-only `Secure` session cookie (HMAC-signed), **TTL ~30 days**.
- No multi-account system.

### Backup / portability

- D1 already is the cloud copy — no R2/Google Drive integration in v1.
- **Export:** download a versioned JSON snapshot of all domain data.
- **Import:** upload JSON → validate → **replace-all** (explicit confirmation in UI). Invalid import leaves DB unchanged.

---

## 4. Data model

### 4.1 Person

- `id`
- `name` (required)
- `note` (optional)
- `created_at`, `updated_at`

### 4.2 Asset

Belongs to exactly one Person. No shared or percentage ownership.

Two kinds:

| Kind | Purpose | Identity fields | Current state | Settled when |
|---|---|---|---|---|
| **Balance** | Money-like (تومان، USD، EUR، USDT، BTC, …) | type/label (freeform) | running quantity | quantity = 0 **and** has at least one transaction |
| **Item** | Physical / belongings | name/description (freeform) | `in_custody` or `returned` | status = `returned` |

New labels/names must be addable without a code deploy.

### 4.3 Transaction

Belongs to exactly one Asset. Each asset has an independent history.

| Asset kind | Allowed types |
|---|---|
| Balance | `deposit`, `return` |
| Item | `received`, `returned` |

Fields:

- `type` (as above)
- `amount` — required for **balance** transactions only; **item** transactions have no amount
- `date` — Gregorian `YYYY-MM-DD` (required)
- `note` — optional
- `created_at`, `updated_at`

**No `adjust` type.** Mistakes are fixed by editing or permanently deleting the wrong transaction.

### 4.4 Create flows (avoid “invisible” zero-state assets)

Because quantity `0` / no custody would hide an asset from the default list:

- **Create balance** = create asset **and** initial `deposit` in one API operation (label + amount + date required).
- **Create item** = create asset **and** initial `received` in one API operation (name + date required).

Later deposits/returns/received/returned use the normal transaction endpoints.

### 4.5 Derived state

- Balance current quantity = sum of deposits minus returns (ledger is source of truth).
- Item status = last `received` / `returned` by `(date, created_at)`.
- Default listings show **active** assets only (non-settled).
- Settled assets remain findable via person → «تسویه‌شده‌ها» (UI spec).

### 4.6 Deletion

- Permanent delete only.
- Deleting a Person cascades to their Assets and Transactions.
- Deleting an Asset cascades to its Transactions.

### 4.7 Export document

Versioned JSON (`schemaVersion: 1`) including all persons, assets, and transactions. Unknown versions rejected; import is all-or-nothing.

---

## 5. Domain rules & validation

- Person name required.
- Balance amounts must be positive for deposit/return.
- **Return cannot exceed current balance** — reject over-return.
- Item: cannot `returned` if not `in_custody`; cannot `received` if already `in_custody`.
- One owner per asset; multiple assets per person allowed.
- Import: unknown/invalid schema → reject entire import; no partial apply.

---

## 6. Data flow

1. Authenticate → session.
2. Mutations validated by API → written to D1 → client cache updated.
3. Offline mutations queued → flushed in order on reconnect → cache refreshed.
4. Export builds snapshot → file download.
5. Import validates → replace-all → clients must refresh.

No background jobs, reminders, or push notifications.

---

## 7. Error handling

| Case | Behavior |
|---|---|
| Wrong password/PIN | Fail closed; no data returned |
| Missing/expired session | Require login; keep local offline queue until re-auth + flush |
| Validation failure | Reject mutation with clear error; DB unchanged |
| Network failure on write | Keep in offline queue; mark unsynced |
| Partial flush failure | Stop; retain remaining queue; do not claim full sync |
| Bad import file | Reject entirely; DB unchanged |

Security posture: single shared secret, HTTPS only, no enterprise audit log.

---

## 8. Testing strategy

**Domain/API:**

- Balance aggregation; settled detection
- Validation (over-return, illegal item transitions)
- Create balance/item includes initial transaction
- Export shape + import replace-all (valid and invalid)
- Auth session create / reject / expire
- CRUD + cascade delete
- Offline queue ordering helpers

**Manual smoke (after UI):**

- Persian RTL + Jalali dates on a phone
- Capture path speed
- Export → import round-trip

No load-testing suite (scale is tiny).

---

## 9. Non-goals (v1)

- Multi-user / SaaS / sharing with contacts
- OAuth / magic links
- Google Drive / R2 dual backup
- Adjust transactions, soft delete, trash, archive
- Notifications, reminders
- AI / natural-language entry
- Accounting reports, multi-currency conversion, exchange rates
- Third-party visual design system (MUI/Chakra/shadcn, etc.)

---

## 10. Related docs

- [UI/UX design](./2026-07-31-personal-asset-custody-tracker-ui-design.md) — Approved
- [Implementation plan](../plans/2026-07-31-personal-asset-custody-tracker.md)
