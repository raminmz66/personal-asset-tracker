# Personal Asset Custody Tracker — Architecture & Data Design

> **Status:** Approved (2026-07-30); **amended 2026-07-31** (money-only hard cut — no tools/items)  
> **Date:** 2026-07-30  
> **Source:** `docs/PRD.md` + brainstorming decisions  
> **Scope:** Architecture, data model, sync, auth, export/import, errors, testing  
> **UI/UX:** See [UI design](./2026-07-31-personal-asset-custody-tracker-ui-design.md) (Approved)  
> **Product focus:** People leave **money** with you (تومان، USDT، currencies, …). Physical tools/belongings are **out of scope**.

---

## 1. Goal

A very small, fast personal app that acts as **external memory** for **money** held on behalf of other people.

Success means: when someone asks how much of theirs you still hold, you can answer confidently within seconds — without relying on memory.

This is **not** accounting, personal finance, portfolio tracking, inventory, or tool lending.

---

## 2. Constraints & decisions

| Topic | Decision |
|---|---|
| Users | Single user (owner only) |
| Scale | ~5–10 contacts, stable |
| Usage | ~2–3 times/month; must be immediate when used |
| What is held | **Money balances only** (freeform labels: تومان، USDT، USD, …) |
| Out of scope | Physical tools, belongings, non-money “items” |
| Client | Mobile web / PWA (primary); desktop optional |
| Language | Persian (Farsi) UI only, RTL |
| Hosting | Cloudflare free tier preferred |
| Data | Cloud source of truth + offline cache |
| Auth | Simple password / PIN (no OAuth) |
| Session | HTTP-only cookie; **TTL ~30 days** |
| Backup | JSON export / import (no second cloud backup service) |
| Dates | Gregorian `YYYY-MM-DD` in API/DB/export; Jalali in UI |
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

- **PWA (Pages):** Answer-first UI per UI spec. Local cache + offline write queue.
- **Workers API:** Session auth, domain validation, CRUD, export/import.
- **D1:** People, balances, transactions. Enable foreign keys (`PRAGMA foreign_keys = ON`).

### Sync (v1)

- Online: API → D1; client updates cache after success.
- Offline: cache reads; enqueue writes; flush in order on reconnect.
- Conflicts: **last-write-wins**.

### Auth

- One password/PIN; HTTP-only `Secure` HMAC session cookie, **TTL ~30 days**.

### Backup / portability

- **Export / import** versioned JSON; import is **replace-all** or reject entirely.

---

## 4. Data model

```
Person → Balance(s) → Transaction(s)
```

### 4.1 Person

- `id`, `name` (required), `note` (optional), `created_at`, `updated_at`

### 4.2 Balance

Belongs to exactly one Person. Freeform **label** (تومان، USDT, …). No shared ownership.

| Field | Notes |
|---|---|
| `id`, `person_id` | |
| `label` | Freeform currency/asset name |
| `created_at`, `updated_at` | |

**Current quantity** = sum(deposits) − sum(returns).  
**Settled** when quantity = 0 (hidden from default list).

There is **no** item/tool entity and no `kind` discriminator for non-money assets.

### 4.3 Transaction

Belongs to exactly one Balance.

| Type | Meaning |
|---|---|
| `deposit` | Money received into custody |
| `return` | Money given back |

Fields: `type`, `amount` (positive), `date` (`YYYY-MM-DD`), `note` (optional), timestamps.

**No** `adjust`, `received`, or `returned` (item) types.

### 4.4 Create flow

**Create balance** = create balance row **and** initial `deposit` in one API operation (`label` + `amount` + `date` required).

Later deposits/returns use the transaction endpoints.

### 4.5 Derived state

- Default lists: **active** balances only (qty > 0).
- Settled balances (qty = 0): via «تسویه‌شده‌ها».

### 4.6 Deletion

Permanent; person → balances → transactions cascade.

### 4.7 Export document

`schemaVersion: 1` JSON with people, balances, transactions. Unknown versions rejected.

---

## 5. Domain rules & validation

- Person name required.
- Amounts must be positive.
- **Return cannot exceed current balance.**
- Import: invalid/unknown schema → reject entirely.

---

## 6. Data flow

1. Authenticate → session.  
2. Mutations validated → D1 → client cache.  
3. Offline queue → flush in order → refresh.  
4. Export / import as above.

No notifications or background jobs.

---

## 7. Error handling

| Case | Behavior |
|---|---|
| Wrong password | Fail closed |
| Missing/expired session | Re-login; keep offline queue |
| Validation failure | Reject; DB unchanged |
| Network write failure | Stay in outbox; unsynced |
| Partial flush | Stop; do not claim full sync |
| Bad import | Reject entirely |

---

## 8. Testing strategy

- Balance aggregation; settled when qty = 0  
- Over-return rejection  
- Create balance includes initial deposit  
- Export/import replace-all  
- Auth session lifecycle  
- Cascade delete  
- Offline queue ordering  

Manual: Persian RTL + Jalali; money capture path; export↔import.

---

## 9. Non-goals (v1)

- Physical tools / belongings / inventory  
- Multi-user / OAuth / dual cloud backup  
- Adjust / soft delete / trash / archive  
- Notifications; FX conversion; accounting reports  
- Third-party visual design systems  

---

## 10. Related docs

- [UI/UX design](./2026-07-31-personal-asset-custody-tracker-ui-design.md) — Approved (money-only)  
- [Implementation plan](../plans/2026-07-31-personal-asset-custody-tracker.md)
