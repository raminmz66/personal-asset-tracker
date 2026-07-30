# Personal Asset Custody Tracker — Architecture & Data Design

> **Status:** Draft for review  
> **Date:** 2026-07-30  
> **Source:** `doc/PRD.md` + brainstorming decisions  
> **Scope of this doc:** Architecture, data model, sync, auth, export/import, errors, testing  
> **Explicitly deferred:** All UI/UX (screens, actions, navigation, copy, fonts, colors, visual design) — separate visual brainstorming before implementation planning

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
| Language | Persian (Farsi) UI only, RTL — visual details deferred |
| Hosting | Cloudflare free tier preferred |
| Data | Cloud source of truth + offline cache |
| Auth | Simple password / PIN (no OAuth) |
| Backup | JSON export + import (no second cloud backup service) |
| Notifications | None |
| Soft delete / trash / archive | None — permanent delete |
| Audit / immutable ledger | None — edit and delete freely |
| UI/UX details | **Deferred** to dedicated visual brainstorming |

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
│  Workers API        │  Auth + CRUD + export/import
└─────────┬───────────┘
          │
┌─────────▼───────────┐
│  D1 (SQLite)        │  Source of truth
└─────────────────────┘
```

### Layers

- **PWA (Pages):** Client UI (to be designed later). Maintains last-known data cache and an offline write queue.
- **Workers API:** Session auth, domain validation, CRUD, export/import.
- **D1:** Authoritative store for people, assets, transactions.

### Sync (v1)

- Online: all reads/writes go through the API to D1; client updates cache after success.
- Offline: reads from cache; writes enqueue locally; on reconnect flush in order, then refresh cache.
- Conflict rule: **last-write-wins** (acceptable for one primary user/device).

### Auth

- One password/PIN set by the owner.
- Successful login issues a short-lived session (HTTP-only cookie or equivalent bearer token).
- No multi-account system.

### Backup / portability

- D1 already is the cloud copy — no R2/Google Drive integration in v1.
- **Export:** download a versioned JSON snapshot of all domain data.
- **Import:** upload JSON → validate → **replace-all** (with explicit confirmation in UI later). Invalid import leaves DB unchanged.

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
| **Balance** | Money-like (تومان، USD، EUR، USDT، BTC, …) | type/label (+ unit as needed) | running quantity | quantity = 0 |
| **Item** | Physical / belongings (tools, etc.) | name/description | `in_custody` or `returned` | status = `returned` |

New asset types/labels must be easy to add (freeform labels for balances; freeform names for items). Prefer not requiring a code deploy to add “EUR” or a new tool name.

### 4.3 Transaction

Belongs to exactly one Asset. Each asset has an independent history.

| Asset kind | Allowed types |
|---|---|
| Balance | `deposit`, `return` |
| Item | `received`, `returned` |

Fields:

- `type` (as above)
- `amount` — required for **balance** transactions only; **item** transactions have no amount (state is purely `in_custody` / `returned` via `received` / `returned`)
- `date` — exact date (required)
- `note` — optional
- `created_at`, `updated_at`

**No `adjust` type.** Mistakes are fixed by editing or permanently deleting the wrong transaction.

### 4.4 Derived state

- Balance current quantity = sum of deposits minus returns (ledger is source of truth; any cached total must be recomputed after edits/deletes).
- Default listings show **active** assets only (non-settled).
- Settled assets remain in the database and are available via a settled/history path (exact UI deferred).

### 4.5 Deletion

- Permanent delete only.
- Deleting a Person cascades to their Assets and Transactions.
- Deleting an Asset cascades to its Transactions.

### 4.6 Export document (conceptual)

Versioned JSON including all persons, assets, and transactions needed for a full restore. Exact schema version field required so import can reject unknowns.

---

## 5. Domain rules & validation

- Person name required.
- Balance amounts must be positive for deposit/return.
- **Return cannot exceed current balance** — reject over-return.
- Item: cannot `returned` if already returned; cannot `received` if already in custody.
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
| Network failure on write | Keep in offline queue; mark unsynced (UI later) |
| Partial flush failure | Stop; retain remaining queue; do not claim full sync |
| Bad import file | Reject entirely; DB unchanged |

Security posture: single shared secret, HTTPS only, no enterprise audit log.

---

## 8. Testing strategy

UI/E2E waits until after UI/UX brainstorming.

**Now (domain/API):**

- Balance aggregation from deposits/returns
- Settled detection for balances and items
- Validation (over-return, illegal item transitions)
- Export shape + import replace-all (valid and invalid)
- Auth session create / reject / expire
- CRUD + cascade delete
- Offline queue ordering helpers (if implemented client-side)

**Later (manual smoke after UI):**

- Persian RTL sanity on a phone
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
- Locked visual design or interaction map (deferred)

---

## 10. Follow-up process

1. **User reviews this spec** and requests changes if needed.
2. **UI/UX brainstorming** (visual artifacts): screens, actions, navigation, fonts, colors, Persian copy.
3. **Implementation plan** (`writing-plans`) only after both this spec and the UI/UX design are approved.

---

## 11. Open items for UI/UX brainstorm (out of scope here)

- Home composition and primary actions
- Quick-add / capture flows
- Person, asset, settled, settings screens
- Confirmation patterns for delete and import
- Unsynced / offline indicators
- Typography, color, motion, component look
- Exact Persian microcopy
