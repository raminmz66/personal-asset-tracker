# Balance Totals — Design

> **Status:** Approved (2026-08-01)
> **Depends on:** [Architecture & data design](./2026-07-30-personal-asset-custody-tracker-design.md) (Approved), [UI/UX design](./2026-07-31-personal-asset-custody-tracker-ui-design.md) (Approved — **amended by this spec**, see §6)
> **Scope:** Answer "how much have you already returned?" on the Balance screen; make the settled list informative
> **Out:** Cross-person totals per label, label autocomplete, per-person summaries, search, any schema or API change

---

## 1. Why

[PRD](../../PRD.md) §6 names three questions the app must answer in seconds. Two are covered. The third — «چقدر پس داده‌ای؟» (§2: "I want to know how much has already been returned") — is not answerable anywhere in the product.

Today the only route to it is opening `تاریخچه` and mentally summing the `برگشت` rows. The number is also structurally invisible: **returned-to-date cannot be derived from current state**, only from the transaction history. A settled balance shows `۰` whether ۵۰ or ۵۰٬۰۰۰٬۰۰۰ passed through it.

Verified absent from the codebase: `packages/domain/src/ledger.ts` exposes only `balanceQuantity`, `isBalanceActive`, `isBalanceSettled`; no `deposited`/`returned` aggregate exists in `packages/domain` or `apps/web`.

This passes the [PRD](../../PRD.md) §27 test — everything must be questioned before being implemented — because it adds no new data, no new workflow, and no new screen. It stops hiding a number the app already stores.

## 2. Locked decisions

| Topic | Decision |
|---|---|
| Numbers shown | `مانده` (existing hero) · `کل واریزی` · `کل برگشتی` |
| `آخرین تغییر` | **Not** built — `تاریخچه` is sorted newest-first directly below, so it would restate what is already on screen |
| Layout | Two-up strip inside the hero block, above `واریز`/`برگشت` |
| Empty-return case | Strip **always** renders; `کل برگشتی ۰` is a valid answer, and the block height stays stable |
| Settled list rows | Show `کل واریزی` instead of the definitional `۰` |
| Hero label | `موجودی فعلی` → `مانده` (amends UI/UX spec §7) |
| Where computed | Pure domain functions → snapshot selectors → components |
| Schema / API | **Unchanged.** No migration, no endpoint, no snapshot-shape change |

## 3. Architecture

Totals follow the path `balanceQuantity` already takes, so there is no new data flow to reason about:

```
transactions (already in snapshot)
  → packages/domain/src/ledger.ts        totalDeposited / totalReturned   (pure, unit-tested)
    → apps/web/src/sync/snapshot-utils.ts  balanceDetailFromSnapshot
                                           settledBalancesForPerson       (selectors)
      → apps/web/src/routes/Balance.tsx    hero strip
      → apps/web/src/routes/Settled.tsx    row amounts
```

Rejected alternatives:

- **Server-side computation with new API fields.** The snapshot already ships every transaction, so this would add route changes, a snapshot-shape change, and a second implementation for the offline path — for no gain.
- **Inline `reduce` in `Balance.tsx`.** Puts ledger arithmetic in a component, untestable alongside `ledger.test.ts`, and needs duplicating for the settled list.

### 3.1 Domain

Two pure functions in `packages/domain/src/ledger.ts`, both exported from `packages/domain/src/index.ts`:

```ts
export function totalDeposited(txs: Transaction[]): number;
export function totalReturned(txs: Transaction[]): number;
```

Each sums `amount` over transactions of the matching `type`. Neither clamps, rounds, nor validates — see §7.

`balanceQuantity` is redefined as `totalDeposited(txs) - totalReturned(txs)`. This is identical for both valid `type` values, and removes the duplicated type-switch. The existing `ledger.test.ts` cases must pass **unchanged** — they are the guard on this refactor.

### 3.2 Selectors

In `apps/web/src/sync/snapshot-utils.ts`:

- `BalanceDetailItem` gains `deposited: number` and `returned: number`
- `BalanceListItem` gains `deposited: number`

`BalanceListItem` is shared by `activeBalancesForPerson` and `settledBalancesForPerson`. Both populate `deposited`; the Person screen ignores it. One type is preferred over two near-identical ones.

## 4. Balance screen

The strip renders **inside** the existing `.balance-hero` element, so that element's current `border-bottom: 1px solid var(--rule)` falls beneath the strip:

```
┌──────────────────────────┐
│  ‹        علی · تتر      │
├──────────────────────────┤
│         مانده            │
│         ۱۵۰              │  ← --text-amount, unchanged
│                          │
│  کل برگشتی   کل واریزی   │  ← new strip
│      ۵۰         ۲۰۰      │
│  ──────────────────────  │  ← existing .balance-hero border-bottom
│   [ واریز ]  [ برگشت ]   │
│  تاریخچه                 │
│  برگشت            −۵۰    │
│  ۱۰ مرداد ۱۴۰۵           │
└──────────────────────────┘
```

**RTL ordering.** With `grid-template-columns: 1fr 1fr` under `direction: rtl`, the first DOM child renders on the **right**. JSX order is therefore `کل واریزی` **first**, then `کل برگشتی` — which is also the natural Persian reading order (in, then out). Getting this backwards silently swaps two numbers that look plausible either way, so it is called out here and asserted in a test (§8).

**Type scale.** New CSS references only existing `--text-*` tokens, preserving the invariant established by the mobile-legibility work (every `font-size` in `global.css` resolves to a token):

| Element | Token | Colour |
|---|---|---|
| Hero number (unchanged) | `--text-amount` (52px) | `--ink` |
| Strip number | `--text-action` (16px) | `--ink` |
| Strip label | `--text-meta` (14px) | `--muted` |

Strip numbers carry `font-variant-numeric: tabular-nums`, matching `.balance-hero-num`.

**Formatting.** Reuse the local `formatAmount` helper already in `Balance.tsx` (`toLocaleString('fa-IR')`), which emits the same U+066C thousands separator as `format/digits.ts`. No new formatter.

## 5. Settled list

`Settled.tsx` passes `deposited` where it currently passes `quantity`, turning a column of `۰` into a record of what passed through each balance.

`BalanceRow`'s prop `quantity` is renamed to `amount` so the caller decides which number to show and the component stays ignorant of settled-ness. Two call sites: `Person.tsx` passes `quantity`, `Settled.tsx` passes `deposited`.

Muting is CSS-only: `Settled.tsx` adds a `person-list--settled` modifier to its list container, and `global.css` mutes `.person-list--settled .balance-row__qty`. No new prop, no boolean flag, no presentation logic inside `BalanceRow`.

## 6. Copy

| Where | File | Now | After |
|---|---|---|---|
| Balance hero label | `routes/Balance.tsx` | `موجودی فعلی` | `مانده` |
| Strip labels | `routes/Balance.tsx` | — | `کل واریزی` · `کل برگشتی` |
| `over_return` error (user-facing) | `api/client.ts` | `برگشت نمی‌تونه از موجودی فعلی بیشتر باشه` | `برگشت نمی‌تونه از مانده بیشتر باشه` |
| `over_return` error (internal) | `packages/domain/src/validate.ts` | `برگشت نمی‌تواند از موجودی فعلی بیشتر باشد` | `برگشت نمی‌تواند از مانده بیشتر باشد` |

Renaming the hero without the two error strings would leave a message pointing at a label that no longer exists on screen. `grep -rn 'موجودی فعلی'` must return **no** matches when this is done. The `validate.ts` string is never displayed — `Balance.tsx` renders `apiErrorMessage(err.code)`, keyed by code — but it is updated for internal consistency.

`مانده` makes the three numbers parallel — in, out, what is left — and reserves `موجودی` for the balance *object* (`موجودی‌ها`, `افزودن موجودی`), which the app already uses it for.

**Amendment to [UI/UX design](./2026-07-31-personal-asset-custody-tracker-ui-design.md):** §7 lists `موجودی فعلی` under preferred copy, and §4.4 describes the hero with that label. Both are superseded by this spec as of 2026-08-01. The amendment must be recorded in that document, not only here.

The mockups in `docs/superpowers/mockups/` are historical artifacts of the original design round and are **not** updated.

## 7. Edge cases

| Case | Behavior |
|---|---|
| Fresh balance, one deposit, no returns | `کل واریزی` equals `مانده`; `کل برگشتی ۰`. Strip still renders. |
| Settled balance (`مانده ۰`) | Strip shows the real history; settled-list row shows `کل واریزی`. |
| Every transaction deleted | All three read `۰`. Honest; the balance remains reachable under `تسویه‌شده‌ها`. |
| Imported backup with negative amounts | **No clamping.** `parseExportDoc` validates types but never calls `assertPositiveAmount`, so `کل برگشتی > کل واریزی` is representable. Render it as-is: a visibly wrong number beats a silently sanitized one. |
| Offline | Identical. All three derive from the IndexedDB snapshot, which already holds every transaction. |

Normal operation cannot produce these last two: `assertBalanceReturnAllowed` rejects a return exceeding the remaining quantity, so `کل واریزی ≥ کل برگشتی ≥ 0` holds for data entered through the UI. The display simply must not *assume* it.

**Known adjacent gap, deliberately not fixed here:** a negative-quantity balance is invisible on both lists, since `isBalanceActive` is `qty > 0` and `isBalanceSettled` is `qty === 0`. Pre-existing, reachable only via a hand-edited import, and unrelated to this feature. Own ticket.

## 8. Testing

| File | Cases |
|---|---|
| `packages/domain/tests/ledger.test.ts` | `totalDeposited` / `totalReturned` over empty, deposits-only, returns-only, and mixed lists; the invariant `balanceQuantity === totalDeposited − totalReturned`; existing cases pass unchanged |
| `apps/web/src/sync/snapshot-utils.test.ts` | `deposited` / `returned` on `balanceDetailFromSnapshot`; `deposited` on `settledBalancesForPerson` |
| `apps/web/src/routes/Balance.totals.test.tsx` | Strip renders both labels with correct values; `کل واریزی` precedes `کل برگشتی` in DOM order (§4 RTL guard); strip present when `کل برگشتی` is `۰` |
| `apps/web/src/routes/Settled.test.tsx` | A fully-returned balance renders its deposited total, not `۰` |

Route-level tests with Testing Library are already established (`Person.delete.test.tsx`, `Login.test.tsx`).

## 9. Out of scope

- Cross-person totals per label (blocked on label normalization; also leans toward the portfolio framing [PRD](../../PRD.md) §7 disowns)
- Label autocomplete on add-balance
- Per-person or home-screen summaries
- Search, notifications, automatic backup
- Any change to `migrations/`, `apps/api/`, or the snapshot payload shape
