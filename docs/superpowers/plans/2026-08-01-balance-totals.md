# Balance Totals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show `کل واریزی` and `کل برگشتی` beside `مانده` on the Balance screen, and show total-passed-through on settled balance rows, so the app can answer "how much have you already returned?".

**Architecture:** Two pure reduce functions in `packages/domain/src/ledger.ts` feed the existing `snapshot-utils.ts` selectors, which feed `Balance.tsx` and `Settled.tsx`. No schema change, no API change, no snapshot-shape change — every number derives from transactions the snapshot already carries, so offline behaves identically.

**Tech Stack:** TypeScript, React 19, Vitest + Testing Library (jsdom), plain CSS with design tokens. npm workspaces: `@pat/domain`, `@pat/web`, `@pat/api`.

**Spec:** [docs/superpowers/specs/2026-08-01-balance-totals-design.md](../specs/2026-08-01-balance-totals-design.md)

## Global Constraints

- **No schema, migration, API route, or snapshot-payload change.** Touch only `packages/domain/src`, `apps/web/src`, and docs.
- **Every `font-size` in `global.css` must reference a `var(--text-*)` token.** Existing invariant from the mobile-legibility work. Do not add raw `px`/`rem` font sizes and do not add new tokens — `--text-action` (16px) and `--text-meta` (14px) already cover this work.
- **No `toBeInTheDocument()`.** `apps/web/vitest.config.ts` declares no `setupFiles`, so `@testing-library/jest-dom` matchers are NOT loaded. Use `toBeTruthy()` / `toBe()` / `toEqual()`, matching `Person.delete.test.tsx`.
- **Every web route test must call `cleanup()` in `afterEach`.** No global auto-cleanup is configured.
- **Copy is informal Persian** ("friend voice"), per the typography-friend-copy spec. Exact strings, copy verbatim:
  - `مانده`
  - `کل واریزی`
  - `کل برگشتی`
  - `برگشت نمی‌تونه از مانده بیشتر باشه` (client)
  - `برگشت نمی‌تواند از مانده بیشتر باشد` (domain, formal — never displayed)
- **`grep -rn 'موجودی فعلی' --include=*.ts --include=*.tsx .` must return zero matches (excluding `node_modules` and `docs/`) when Task 5 is done.**
- **No clamping of totals.** Negative or inverted values from a hand-edited import must render as-is.
- **Commit after every task**, using the message given in that task's final step.

---

### Task 1: Domain totals

**Files:**
- Modify: `packages/domain/src/ledger.ts` (whole file, currently 18 lines)
- Modify: `packages/domain/src/index.ts:2-6` (the `./ledger` export block)
- Test: `packages/domain/tests/ledger.test.ts`

**Interfaces:**
- Consumes: `Transaction` from `packages/domain/src/types.ts` — `{ id, balanceId, type: 'deposit' | 'return', amount: number, date, note, createdAt, updatedAt }`
- Produces:
  - `totalDeposited(txs: Transaction[]): number`
  - `totalReturned(txs: Transaction[]): number`
  - `balanceQuantity(txs: Transaction[]): number` — unchanged signature, reimplemented
  - All three exported from `@pat/domain`

- [ ] **Step 1: Write the failing tests**

Append to `packages/domain/tests/ledger.test.ts`. Also add the two new names to the existing import block at the top of that file, so it reads:

```ts
import {
  balanceQuantity,
  isBalanceSettled,
  isBalanceActive,
  totalDeposited,
  totalReturned,
} from "../src/ledger";
```

Then append:

```ts
describe("totalDeposited / totalReturned", () => {
  const mixed: Transaction[] = [
    { ...base, id: "1", type: "deposit", amount: 200 },
    { ...base, id: "2", type: "return", amount: 50 },
    { ...base, id: "3", type: "deposit", amount: 100 },
  ];

  it("sums only deposits", () => {
    expect(totalDeposited(mixed)).toBe(300);
  });

  it("sums only returns", () => {
    expect(totalReturned(mixed)).toBe(50);
  });

  it("is zero with no txs", () => {
    expect(totalDeposited([])).toBe(0);
    expect(totalReturned([])).toBe(0);
  });

  it("is zero for the absent type", () => {
    const depositsOnly: Transaction[] = [
      { ...base, id: "1", type: "deposit", amount: 40 },
    ];
    const returnsOnly: Transaction[] = [
      { ...base, id: "1", type: "return", amount: 40 },
    ];
    expect(totalReturned(depositsOnly)).toBe(0);
    expect(totalDeposited(returnsOnly)).toBe(0);
  });

  it("keeps balanceQuantity equal to deposited minus returned", () => {
    expect(balanceQuantity(mixed)).toBe(
      totalDeposited(mixed) - totalReturned(mixed),
    );
  });

  it("does not clamp an over-returned balance to zero", () => {
    // Reachable only via a hand-edited import: parseExportDoc validates
    // types but never calls assertPositiveAmount. Show the bad number.
    const overReturned: Transaction[] = [
      { ...base, id: "1", type: "deposit", amount: 10 },
      { ...base, id: "2", type: "return", amount: 25 },
    ];
    expect(balanceQuantity(overReturned)).toBe(-15);
    expect(totalReturned(overReturned)).toBe(25);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test
```

Expected: FAIL — `totalDeposited is not a function` (the import resolves to `undefined`). The pre-existing `balanceQuantity` and `settled / active` describes still pass.

- [ ] **Step 3: Rewrite `packages/domain/src/ledger.ts`**

Replace the entire file with:

```ts
import type { Transaction } from "./types";

function sumByType(txs: Transaction[], type: Transaction["type"]): number {
  return txs.reduce((sum, t) => (t.type === type ? sum + t.amount : sum), 0);
}

/** Everything ever put in, ignoring what has since gone back out. */
export function totalDeposited(txs: Transaction[]): number {
  return sumByType(txs, "deposit");
}

/** Everything ever handed back. Answers «چقدر پس داده‌ای؟». */
export function totalReturned(txs: Transaction[]): number {
  return sumByType(txs, "return");
}

/**
 * What is still held. Deliberately not clamped at zero: an imported backup
 * can carry amounts `assertPositiveAmount` would have rejected, and a
 * visibly wrong number beats a silently sanitized one.
 */
export function balanceQuantity(txs: Transaction[]): number {
  return totalDeposited(txs) - totalReturned(txs);
}

export function isBalanceSettled(qty: number): boolean {
  return qty === 0;
}

export function isBalanceActive(qty: number): boolean {
  return qty > 0;
}
```

- [ ] **Step 4: Export the new functions**

In `packages/domain/src/index.ts`, change the `./ledger` export block to:

```ts
export {
  balanceQuantity,
  isBalanceSettled,
  isBalanceActive,
  totalDeposited,
  totalReturned,
} from "./ledger";
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm test
```

Expected: PASS, all describes green — including the two pre-existing `balanceQuantity` cases, which are the guard on the reimplementation.

- [ ] **Step 6: Commit**

```bash
git add packages/domain/src/ledger.ts packages/domain/src/index.ts packages/domain/tests/ledger.test.ts
git commit -m "feat(domain): add totalDeposited and totalReturned

Returned-to-date cannot be derived from current state, only from
history. Redefines balanceQuantity as deposited minus returned, which is
identical for both valid types and removes the duplicated type switch.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Snapshot selectors

**Files:**
- Modify: `apps/web/src/sync/snapshot-utils.ts` (types at lines 10-30; `activeCountForPerson`, `activeBalancesForPerson`, `settledBalancesForPerson`, `balanceDetailFromSnapshot`)
- Test: `apps/web/src/sync/snapshot-utils.test.ts`

**Interfaces:**
- Consumes: `totalDeposited`, `totalReturned`, `balanceQuantity`, `isBalanceActive`, `isBalanceSettled` from `@pat/domain` (Task 1)
- Produces:
  - `BalanceListItem` = `{ id: string; label: string; quantity: number; deposited: number }`
  - `BalanceDetailItem` = `{ id: string; personId: string; personName: string; label: string; quantity: number; deposited: number; returned: number; transactions: Transaction[] }`
  - Function signatures all unchanged.

Note: `activeBalancesForPerson` and `settledBalancesForPerson` are currently near-identical copies of one loop, and `activeCountForPerson` is a third copy. Both list functions need the new field, so this task folds all three onto one private helper. `snapshot-utils.test.ts` currently covers only `removePersonFromSnapshot`, so Step 1 adds the tests that make this refactor safe.

- [ ] **Step 1: Write the failing tests**

Append to `apps/web/src/sync/snapshot-utils.test.ts`. First extend the import at the top of that file to:

```ts
import {
  activeBalancesForPerson,
  activeCountForPerson,
  balanceDetailFromSnapshot,
  removePersonFromSnapshot,
  settledBalancesForPerson,
} from './snapshot-utils'
```

Then append:

```ts
/**
 * p1 holds two balances:
 *   b1 تومان — deposited 200, returned 50 → quantity 150 (active)
 *   b2 دلار  — deposited 80,  returned 80 → quantity 0   (settled)
 */
const totalsSnapshot: Snapshot = {
  people: [
    { id: 'p1', name: 'الف', note: null, createdAt: 'x', updatedAt: 'x' },
  ],
  balances: [
    { id: 'b1', personId: 'p1', label: 'تومان', createdAt: 'x', updatedAt: 'x' },
    { id: 'b2', personId: 'p1', label: 'دلار', createdAt: 'x', updatedAt: 'x' },
  ],
  transactions: [
    {
      id: 't1',
      balanceId: 'b1',
      type: 'deposit',
      amount: 200,
      date: '2026-07-01',
      note: null,
      createdAt: 'x',
      updatedAt: 'x',
    },
    {
      id: 't2',
      balanceId: 'b1',
      type: 'return',
      amount: 50,
      date: '2026-07-02',
      note: null,
      createdAt: 'x',
      updatedAt: 'x',
    },
    {
      id: 't3',
      balanceId: 'b2',
      type: 'deposit',
      amount: 80,
      date: '2026-07-01',
      note: null,
      createdAt: 'x',
      updatedAt: 'x',
    },
    {
      id: 't4',
      balanceId: 'b2',
      type: 'return',
      amount: 80,
      date: '2026-07-03',
      note: null,
      createdAt: 'x',
      updatedAt: 'x',
    },
  ],
  updatedAt: 'x',
}

describe('balanceDetailFromSnapshot totals', () => {
  it('reports deposited, returned, and remaining', () => {
    const detail = balanceDetailFromSnapshot(totalsSnapshot, 'b1')
    expect(detail?.deposited).toBe(200)
    expect(detail?.returned).toBe(50)
    expect(detail?.quantity).toBe(150)
  })

  it('reports the full history of a settled balance', () => {
    const detail = balanceDetailFromSnapshot(totalsSnapshot, 'b2')
    expect(detail?.quantity).toBe(0)
    expect(detail?.deposited).toBe(80)
    expect(detail?.returned).toBe(80)
  })

  it('counts only its own balance’s transactions', () => {
    const detail = balanceDetailFromSnapshot(totalsSnapshot, 'b1')
    expect(detail?.transactions.map((t) => t.id)).toEqual(['t2', 't1'])
  })

  it('is null for an unknown balance', () => {
    expect(balanceDetailFromSnapshot(totalsSnapshot, 'nope')).toBe(null)
  })
})

describe('balance list selectors', () => {
  it('lists only active balances, with deposited', () => {
    const items = activeBalancesForPerson(totalsSnapshot, 'p1')
    expect(items).toEqual([
      { id: 'b1', label: 'تومان', quantity: 150, deposited: 200 },
    ])
  })

  it('lists only settled balances, carrying what passed through', () => {
    const items = settledBalancesForPerson(totalsSnapshot, 'p1')
    expect(items).toEqual([
      { id: 'b2', label: 'دلار', quantity: 0, deposited: 80 },
    ])
  })

  it('counts active balances', () => {
    expect(activeCountForPerson(totalsSnapshot, 'p1')).toBe(1)
  })

  it('returns nothing for a person with no balances', () => {
    expect(activeBalancesForPerson(totalsSnapshot, 'ghost')).toEqual([])
    expect(settledBalancesForPerson(totalsSnapshot, 'ghost')).toEqual([])
    expect(activeCountForPerson(totalsSnapshot, 'ghost')).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test -w @pat/web -- src/sync/snapshot-utils.test.ts
```

Expected: FAIL — `expected undefined to be 200` on `detail?.deposited`, and the `toEqual` list assertions fail because the objects lack `deposited`.

- [ ] **Step 3: Add the new fields to the two exported types**

In `apps/web/src/sync/snapshot-utils.ts`, replace the `BalanceListItem` and `BalanceDetailItem` declarations with:

```ts
export type BalanceListItem = {
  id: string
  label: string
  quantity: number
  /** Everything ever deposited — what a settled row shows instead of ۰. */
  deposited: number
}

export type BalanceDetailItem = {
  id: string
  personId: string
  personName: string
  label: string
  quantity: number
  deposited: number
  returned: number
  transactions: Transaction[]
}
```

- [ ] **Step 4: Extend the `@pat/domain` import**

Change the import block at the top of `apps/web/src/sync/snapshot-utils.ts` to:

```ts
import {
  balanceQuantity,
  isBalanceActive,
  isBalanceSettled,
  personShortStatus,
  totalDeposited,
  totalReturned,
  type Transaction,
} from '@pat/domain'
```

- [ ] **Step 5: Populate the totals in `balanceDetailFromSnapshot`**

Replace its `return` statement with:

```ts
  return {
    id: balance.id,
    personId: balance.personId,
    personName: person?.name ?? '…',
    label: balance.label,
    quantity: balanceQuantity(txs),
    deposited: totalDeposited(txs),
    returned: totalReturned(txs),
    transactions: sortTransactionsNewestFirst(txs),
  }
```

- [ ] **Step 6: Fold the three duplicated loops onto one helper**

Replace `activeCountForPerson`, `activeBalancesForPerson`, and `settledBalancesForPerson` — all three functions, in full — with:

```ts
/**
 * Balances for a person whose quantity satisfies `include`, label-sorted.
 * The active and settled selectors differ only by that predicate.
 */
function balanceItemsForPerson(
  snapshot: Snapshot,
  personId: string,
  include: (quantity: number) => boolean,
): BalanceListItem[] {
  const balances = snapshot.balances.filter((b) => b.personId === personId)
  const items: BalanceListItem[] = []

  for (const balance of balances) {
    const txs = snapshot.transactions.filter((t) => t.balanceId === balance.id)
    const quantity = balanceQuantity(txs)
    if (include(quantity)) {
      items.push({
        id: balance.id,
        label: balance.label,
        quantity,
        deposited: totalDeposited(txs),
      })
    }
  }

  return items.sort((a, b) => a.label.localeCompare(b.label, 'fa'))
}

export function activeBalancesForPerson(
  snapshot: Snapshot,
  personId: string,
): BalanceListItem[] {
  return balanceItemsForPerson(snapshot, personId, isBalanceActive)
}

export function settledBalancesForPerson(
  snapshot: Snapshot,
  personId: string,
): BalanceListItem[] {
  return balanceItemsForPerson(snapshot, personId, isBalanceSettled)
}

export function activeCountForPerson(
  snapshot: Snapshot,
  personId: string,
): number {
  return activeBalancesForPerson(snapshot, personId).length
}
```

Keep `personFromSnapshot`, `peopleFromSnapshot`, `sortTransactionsNewestFirst`, and `removePersonFromSnapshot` exactly as they are.

- [ ] **Step 7: Run the whole web suite to verify nothing regressed**

```bash
npm run test -w @pat/web
```

Expected: PASS. `Person.delete.test.tsx` exercises all three refactored selectors indirectly and must stay green.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/sync/snapshot-utils.ts apps/web/src/sync/snapshot-utils.test.ts
git commit -m "feat(web): carry deposited and returned through snapshot selectors

Folds the three near-identical per-person balance loops onto one
predicate-driven helper, since both list selectors needed the new field.
Adds the first tests for these selectors.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Balance screen strip

**Files:**
- Modify: `apps/web/src/routes/Balance.tsx:249-254` (the `.balance-hero` block)
- Modify: `apps/web/src/styles/global.css` (insert after the `.balance-hero-num` rule, currently ending line 528)
- Create: `apps/web/src/routes/Balance.totals.test.tsx`

**Interfaces:**
- Consumes: `BalanceDetailItem` with `deposited` and `returned` from Task 2; the local `formatAmount` helper already defined at `Balance.tsx:28-30`
- Produces: DOM classes `balance-hero-totals`, `balance-hero-total`, `balance-hero-total-label`, `balance-hero-total-num` — Task 4 does not depend on these.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/routes/Balance.totals.test.tsx`:

```tsx
import type { Transaction } from '@pat/domain'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import type { Snapshot } from '../sync/cache'

const { getSnapshotMock, setSnapshotMock, navigateMock } = vi.hoisted(() => ({
  getSnapshotMock: vi.fn(),
  setSnapshotMock: vi.fn(),
  navigateMock: vi.fn(),
}))

vi.mock('react-router', () => ({
  useParams: () => ({ id: 'b1' }),
  useNavigate: () => navigateMock,
}))

vi.mock('../sync/SyncContext', () => ({
  useSync: () => ({
    online: true,
    pendingCount: 0,
    lastSyncedAt: null,
    refresh: vi.fn().mockResolvedValue(undefined),
    mutate: vi.fn(),
    clearOutbox: vi.fn(),
  }),
  // Balance.tsx does `err instanceof MutateError`, so the mock must supply
  // a real constructor, not undefined.
  MutateError: class MutateError extends Error {
    code: string
    constructor(code: string) {
      super(code)
      this.code = code
    }
  },
}))

vi.mock('../sync/cache', () => ({
  getSnapshot: getSnapshotMock,
  setSnapshot: setSnapshotMock,
}))

import { Balance } from './Balance'

function tx(
  id: string,
  type: 'deposit' | 'return',
  amount: number,
  date: string,
): Transaction {
  return {
    id,
    balanceId: 'b1',
    type,
    amount,
    date,
    note: null,
    createdAt: id,
    updatedAt: id,
  }
}

function snapshotWith(transactions: Transaction[]): Snapshot {
  return {
    people: [
      { id: 'p1', name: 'الف', note: null, createdAt: 'x', updatedAt: 'x' },
    ],
    balances: [
      { id: 'b1', personId: 'p1', label: 'تتر', createdAt: 'x', updatedAt: 'x' },
    ],
    transactions,
    updatedAt: 'x',
  }
}

function stripText(container: HTMLElement, selector: string): string[] {
  return Array.from(container.querySelectorAll(selector)).map(
    (el) => el.textContent ?? '',
  )
}

describe('Balance totals strip', () => {
  beforeEach(() => {
    getSnapshotMock.mockReset()
    setSnapshotMock.mockReset().mockResolvedValue(undefined)
    navigateMock.mockReset()
  })
  afterEach(() => cleanup())

  it('labels the hero مانده', async () => {
    getSnapshotMock.mockResolvedValue(
      snapshotWith([tx('t1', 'deposit', 200, '2026-07-01')]),
    )
    const { container } = render(<Balance />)

    await waitFor(() => expect(screen.getByText('کل واریزی')).toBeTruthy())
    expect(container.querySelector('.balance-hero-label')?.textContent).toBe(
      'مانده',
    )
    expect(container.querySelector('.balance-hero-num')?.textContent).toBe(
      '۲۰۰',
    )
  })

  it('shows واریزی before برگشتی, which is rightmost in RTL', async () => {
    getSnapshotMock.mockResolvedValue(
      snapshotWith([
        tx('t1', 'deposit', 200, '2026-07-01'),
        tx('t2', 'return', 50, '2026-07-02'),
      ]),
    )
    const { container } = render(<Balance />)

    await waitFor(() => expect(screen.getByText('کل واریزی')).toBeTruthy())
    // DOM order is the assertion: under direction:rtl the first grid child
    // renders on the right, so واریزی must come first or the two numbers
    // silently swap places on screen.
    expect(stripText(container, '.balance-hero-total-label')).toEqual([
      'کل واریزی',
      'کل برگشتی',
    ])
    expect(stripText(container, '.balance-hero-total-num')).toEqual([
      '۲۰۰',
      '۵۰',
    ])
    expect(container.querySelector('.balance-hero-num')?.textContent).toBe(
      '۱۵۰',
    )
  })

  it('still shows the strip when nothing has been returned', async () => {
    getSnapshotMock.mockResolvedValue(
      snapshotWith([tx('t1', 'deposit', 200, '2026-07-01')]),
    )
    const { container } = render(<Balance />)

    await waitFor(() => expect(screen.getByText('کل برگشتی')).toBeTruthy())
    expect(stripText(container, '.balance-hero-total-num')).toEqual([
      '۲۰۰',
      '۰',
    ])
  })

  it('reports the real history of a settled balance', async () => {
    getSnapshotMock.mockResolvedValue(
      snapshotWith([
        tx('t1', 'deposit', 200, '2026-07-01'),
        tx('t2', 'return', 200, '2026-07-02'),
      ]),
    )
    const { container } = render(<Balance />)

    await waitFor(() => expect(screen.getByText('کل واریزی')).toBeTruthy())
    expect(container.querySelector('.balance-hero-num')?.textContent).toBe('۰')
    expect(stripText(container, '.balance-hero-total-num')).toEqual([
      '۲۰۰',
      '۲۰۰',
    ])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm run test -w @pat/web -- src/routes/Balance.totals.test.tsx
```

Expected: FAIL — `Unable to find an element with the text: کل واریزی`.

- [ ] **Step 3: Render the strip**

In `apps/web/src/routes/Balance.tsx`, replace the `.balance-hero` block:

```tsx
            <div className="balance-hero">
              <div className="balance-hero-label">موجودی فعلی</div>
              <div className="balance-hero-num">
                {formatAmount(detail.quantity)}
              </div>
            </div>
```

with:

```tsx
            <div className="balance-hero">
              <div className="balance-hero-label">مانده</div>
              <div className="balance-hero-num">
                {formatAmount(detail.quantity)}
              </div>
              {/* واریزی first: under direction:rtl the first grid child sits
                  on the right, matching the reading order in, then out. */}
              <dl className="balance-hero-totals">
                <div className="balance-hero-total">
                  <dt className="balance-hero-total-label">کل واریزی</dt>
                  <dd className="balance-hero-total-num">
                    {formatAmount(detail.deposited)}
                  </dd>
                </div>
                <div className="balance-hero-total">
                  <dt className="balance-hero-total-label">کل برگشتی</dt>
                  <dd className="balance-hero-total-num">
                    {formatAmount(detail.returned)}
                  </dd>
                </div>
              </dl>
            </div>
```

- [ ] **Step 4: Style the strip**

In `apps/web/src/styles/global.css`, insert directly after the `.balance-hero-num { … }` rule:

```css
.balance-hero-totals {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
  margin: 0.75rem 0 0;
}

.balance-hero-total-label {
  font-size: var(--text-meta);
  color: var(--muted);
}

.balance-hero-total-num {
  margin: 0;
  font-size: var(--text-action);
  font-variant-numeric: tabular-nums;
}
```

The strip inherits `text-align: center` from `.balance-hero`, and that element's existing `border-bottom: 1px solid var(--rule)` now falls beneath the strip — which is the intended layout. `margin: 0` on the number resets the browser default `margin-inline-start` on `dd`.

- [ ] **Step 5: Run the test to verify it passes**

```bash
npm run test -w @pat/web -- src/routes/Balance.totals.test.tsx
```

Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/routes/Balance.tsx apps/web/src/styles/global.css apps/web/src/routes/Balance.totals.test.tsx
git commit -m "feat(web): show کل واریزی and کل برگشتی under the balance hero

Answers the PRD's third question. Renames the hero label to مانده so the
three numbers read as in, out, what is left.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Settled rows show what passed through

**Files:**
- Modify: `apps/web/src/components/BalanceRow.tsx` (whole file, 18 lines)
- Modify: `apps/web/src/routes/Person.tsx:266-273` (the `BalanceRow` call)
- Modify: `apps/web/src/routes/Settled.tsx:85-93` (list container + `BalanceRow` call)
- Modify: `apps/web/src/styles/global.css` (insert after the `.balance-row__qty` rule, currently ending line 392)
- Create: `apps/web/src/routes/Settled.test.tsx`

**Interfaces:**
- Consumes: `BalanceListItem.deposited` from Task 2
- Produces: `BalanceRow` prop renamed `quantity` → `amount`. Two call sites, both updated in this task; no later task depends on it.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/routes/Settled.test.tsx`:

```tsx
import type { ReactNode } from 'react'
import type { Transaction } from '@pat/domain'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import type { Snapshot } from '../sync/cache'

const { getSnapshotMock, navigateMock } = vi.hoisted(() => ({
  getSnapshotMock: vi.fn(),
  navigateMock: vi.fn(),
}))

vi.mock('react-router', () => ({
  useParams: () => ({ id: 'p1' }),
  useNavigate: () => navigateMock,
  Link: ({ children }: { children?: ReactNode }) => <a>{children}</a>,
}))

vi.mock('../sync/SyncContext', () => ({
  useSync: () => ({
    online: true,
    pendingCount: 0,
    lastSyncedAt: null,
    refresh: vi.fn().mockResolvedValue(undefined),
    mutate: vi.fn(),
    clearOutbox: vi.fn(),
  }),
}))

vi.mock('../sync/cache', () => ({
  getSnapshot: getSnapshotMock,
}))

import { Settled } from './Settled'

function tx(id: string, type: 'deposit' | 'return', amount: number): Transaction {
  return {
    id,
    balanceId: 'b1',
    type,
    amount,
    date: '2026-07-01',
    note: null,
    createdAt: 'x',
    updatedAt: 'x',
  }
}

/** One person, one fully-returned balance carrying `transactions`. */
function snapshotWith(transactions: Transaction[]): Snapshot {
  return {
    people: [
      { id: 'p1', name: 'الف', note: null, createdAt: 'x', updatedAt: 'x' },
    ],
    balances: [
      { id: 'b1', personId: 'p1', label: 'تتر', createdAt: 'x', updatedAt: 'x' },
    ],
    transactions,
    updatedAt: 'x',
  }
}

describe('Settled list', () => {
  beforeEach(() => {
    getSnapshotMock.mockReset()
    navigateMock.mockReset()
  })
  afterEach(() => cleanup())

  it('shows what passed through the balance, not the definitional ۰', async () => {
    getSnapshotMock.mockResolvedValue(
      snapshotWith([tx('t1', 'deposit', 200), tx('t2', 'return', 200)]),
    )
    const { container } = render(<Settled />)

    await waitFor(() => expect(screen.getByText('تتر')).toBeTruthy())
    expect(container.querySelector('.balance-row__qty')?.textContent).toBe('۲۰۰')
  })

  it('mutes the amount via the settled list modifier', async () => {
    getSnapshotMock.mockResolvedValue(
      snapshotWith([tx('t1', 'deposit', 200), tx('t2', 'return', 200)]),
    )
    const { container } = render(<Settled />)

    await waitFor(() => expect(screen.getByText('تتر')).toBeTruthy())
    expect(container.querySelector('.person-list--settled')).toBeTruthy()
  })

  it('says nothing is settled when nothing is', async () => {
    getSnapshotMock.mockResolvedValue(snapshotWith([tx('t1', 'deposit', 200)]))
    render(<Settled />)

    await waitFor(() =>
      expect(screen.getByText('چیزی تو تسویه‌شده‌ها نیست')).toBeTruthy(),
    )
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm run test -w @pat/web -- src/routes/Settled.test.tsx
```

Expected: FAIL — the first test gets `'۰'` instead of `'۲۰۰'`, and the second finds no `.person-list--settled` element.

- [ ] **Step 3: Rename the `BalanceRow` prop**

Replace all of `apps/web/src/components/BalanceRow.tsx` with:

```tsx
import { Link } from 'react-router'

type BalanceRowProps = {
  id: string
  label: string
  /**
   * The number to display. Callers choose which one: the person screen
   * shows the remaining quantity, the settled screen shows what passed
   * through — so this component stays ignorant of settled-ness.
   */
  amount: number
}

export function BalanceRow({ id, label, amount }: BalanceRowProps) {
  return (
    <Link to={`/balances/${id}`} className="balance-row">
      <span className="balance-row__label">{label}</span>
      <strong className="balance-row__qty">
        {amount.toLocaleString('fa-IR')}
      </strong>
    </Link>
  )
}
```

- [ ] **Step 4: Update the Person call site**

In `apps/web/src/routes/Person.tsx`, change the `BalanceRow` usage to pass `amount`:

```tsx
                {balances.map((balance) => (
                  <BalanceRow
                    key={balance.id}
                    id={balance.id}
                    label={balance.label}
                    amount={balance.quantity}
                  />
                ))}
```

- [ ] **Step 5: Update the Settled call site**

In `apps/web/src/routes/Settled.tsx`, change the list block to add the modifier class and pass `deposited`:

```tsx
            <div className="person-list person-list--settled">
              {balances.map((balance) => (
                <BalanceRow
                  key={balance.id}
                  id={balance.id}
                  label={balance.label}
                  amount={balance.deposited}
                />
              ))}
            </div>
```

- [ ] **Step 6: Mute the settled amounts**

In `apps/web/src/styles/global.css`, insert directly after the `.balance-row__qty { … }` rule:

```css
/* Settled rows show what passed through, not a live balance — so the
   number is present but recessive. */
.person-list--settled .balance-row__qty {
  font-weight: 400;
  color: var(--muted);
}
```

- [ ] **Step 7: Run the whole web suite**

```bash
npm run test -w @pat/web
```

Expected: PASS. The prop rename would break any other `BalanceRow` caller; this confirms there are only the two.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/BalanceRow.tsx apps/web/src/routes/Person.tsx apps/web/src/routes/Settled.tsx apps/web/src/styles/global.css apps/web/src/routes/Settled.test.tsx
git commit -m "feat(web): show total passed through on settled rows

The settled list was a column of ۰, since settled means quantity zero by
definition. Renames BalanceRow's prop to amount so the caller picks the
number and the component stays presentation-context-free.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Retire `موجودی فعلی` from error copy and amend the UI spec

**Files:**
- Modify: `apps/web/src/api/client.ts:227` (the `over_return` message)
- Modify: `packages/domain/src/validate.ts:23` (the `over_return` ValidationError message)
- Modify: `docs/superpowers/specs/2026-07-31-personal-asset-custody-tracker-ui-design.md` (status line, §2 table, §4.4, §7)

**Interfaces:**
- Consumes: nothing
- Produces: nothing. Copy and docs only.

Renaming the hero in Task 3 orphaned two error strings that point at a label no longer on screen. The `validate.ts` string is never displayed — `Balance.tsx` renders `apiErrorMessage(err.code)`, keyed by code — but it is updated so the two stay in step.

- [ ] **Step 1: Confirm exactly what is left to change**

```bash
grep -rn 'موجودی فعلی' --include=*.ts --include=*.tsx . | grep -v node_modules
```

Expected: exactly two hits — `apps/web/src/api/client.ts:227` and `packages/domain/src/validate.ts:23`. If `apps/web/src/routes/Balance.tsx` still appears, Task 3 Step 3 was not applied.

- [ ] **Step 2: Update the user-facing message**

In `apps/web/src/api/client.ts`, in `API_ERROR_MESSAGES`:

```ts
  over_return: 'برگشت نمی‌تونه از مانده بیشتر باشه',
```

- [ ] **Step 3: Update the domain message**

In `packages/domain/src/validate.ts`, inside `assertBalanceReturnAllowed`:

```ts
    throw new ValidationError(
      "over_return",
      "برگشت نمی‌تواند از مانده بیشتر باشد",
    );
```

- [ ] **Step 4: Verify the phrase is gone from code**

```bash
grep -rn 'موجودی فعلی' --include=*.ts --include=*.tsx . | grep -v node_modules
```

Expected: no output, exit status 1.

- [ ] **Step 5: Amend the UI/UX design spec**

In `docs/superpowers/specs/2026-07-31-personal-asset-custody-tracker-ui-design.md`, make four edits.

Status line — replace:

```markdown
> **Status:** Approved (2026-07-31); **amended 2026-07-31** (money-only hard cut)  
```

with:

```markdown
> **Status:** Approved (2026-07-31); **amended 2026-07-31** (money-only hard cut); **amended 2026-08-01** (balance totals — see [balance totals design](./2026-08-01-balance-totals-design.md))  
```

§2 locked-decisions table — replace the `Balance tap` row:

```markdown
| Balance tap | Current amount + **history first**; واریز / برگشت |
```

with:

```markdown
| Balance tap | `مانده` + `کل واریزی` / `کل برگشتی` + **history**; واریز / برگشت |
```

§4.4 — replace:

```markdown
### 4.4 Balance
- موجودی فعلی on top
```

with:

```markdown
### 4.4 Balance
- مانده on top, with کل واریزی / کل برگشتی beneath it
```

§7 — replace:

```markdown
Preferred: موجودی فعلی، واریز، برگشت، موجودی، تسویه، تسویه‌شده‌ها، افزودن موجودی  
```

with:

```markdown
Preferred: مانده، کل واریزی، کل برگشتی، واریز، برگشت، موجودی، تسویه، تسویه‌شده‌ها، افزودن موجودی  

`موجودی` names the balance **object** (موجودی‌ها، افزودن موجودی); `مانده` names its current **number**. Do not use `موجودی فعلی` — retired 2026-08-01.
```

- [ ] **Step 6: Run every test in the repo**

```bash
npm run test:all
```

Expected: PASS across `@pat/domain`, `@pat/web`, and `@pat/api`.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/api/client.ts packages/domain/src/validate.ts docs/superpowers/specs/2026-07-31-personal-asset-custody-tracker-ui-design.md
git commit -m "refactor: retire موجودی فعلی in favour of مانده

The over_return errors named a label the Balance screen no longer shows.
Amends the UI/UX spec, which listed موجودی فعلی as preferred copy.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Verification gate

**Files:** none modified. This task only runs checks and must find nothing.

**Interfaces:**
- Consumes: the finished work of Tasks 1-5
- Produces: a green build, the precondition for Task 7

- [ ] **Step 1: Full test suite**

```bash
npm run test:all
```

Expected: PASS, no failures, no skipped suites.

- [ ] **Step 2: TypeScript + production build**

```bash
npm run build -w @pat/web
```

Expected: exit 0. This runs `tsc -b` before `vite build`, so it is the real type check — it is what would catch a missed `quantity` → `amount` call site or a `BalanceDetailItem` field mismatch.

- [ ] **Step 3: Confirm the retired phrase is absent from code**

```bash
grep -rn 'موجودی فعلی' --include=*.ts --include=*.tsx . | grep -v node_modules
```

Expected: no output.

- [ ] **Step 4: Confirm no schema, API, or migration drift**

```bash
git diff --stat b562a32 -- apps/api apps/api/migrations packages/domain/src/types.ts
```

`b562a32` is the design-spec commit, i.e. the baseline immediately before Task 1. Expected: no output. Global constraints forbid touching these; `packages/domain/src/types.ts` in particular must be untouched, since no stored field was added.

- [ ] **Step 5: Confirm the working tree is clean**

```bash
git status --porcelain
```

Expected: no output. Every change is committed.

---

### Task 7: Push and deploy

**Files:** none modified.

**Interfaces:**
- Consumes: a green Task 6
- Produces: the feature live on Cloudflare

Deploy targets, both already configured in the repo: the API Worker is unchanged by this work, so **only the web Pages project needs deploying**. `apps/web/package.json`'s `deploy` script runs `npm run build && wrangler pages deploy`.

- [ ] **Step 1: Push**

```bash
git push origin main
```

- [ ] **Step 2: Deploy the frontend**

```bash
npm run deploy -w @pat/web
```

Expected: Wrangler uploads `dist` to the `personal-asset-tracker-web` Pages project and prints a deployment URL. Requires a completed `wrangler login`; if it fails with an authentication error, stop and report it rather than retrying — the login is interactive and belongs to the user.

- [ ] **Step 3: Do NOT deploy the API**

No migration and no route changed, so `apps/api` needs no deploy. Confirm with:

```bash
git diff --stat b562a32 -- apps/api
```

Expected: no output.

- [ ] **Step 4: Verify on the deployed URL**

Open the Pages URL, log in, open a person with a partly-returned balance, and confirm:

- the hero reads `مانده`
- `کل واریزی` sits on the **right**, `کل برگشتی` on the **left**
- `تسویه‌شده‌ها` shows real amounts, muted, instead of a column of `۰`

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| §3.1 domain functions, `balanceQuantity` redefinition | 1 |
| §3.2 selector fields | 2 |
| §4 strip, RTL order, type scale, formatting | 3 |
| §5 settled rows, prop rename, CSS-only muting | 4 |
| §6 copy table incl. both `over_return` strings, spec amendment | 5 |
| §7 edge cases: no-returns, settled, no clamping | 1 (clamping), 3 (no-returns, settled) |
| §7 offline | Covered by construction — selectors read the snapshot; no online-only path added |
| §8 all four test files | 1, 2, 3, 4 |
| §9 out of scope | Enforced by Global Constraints + Task 6 Step 4 |

The §7 "every transaction deleted" case is exercised by Task 1's empty-list cases at the domain level; no separate UI test, since the strip renders `۰` through the same path as the no-returns case already asserted in Task 3.

**Placeholder scan:** none — every code step carries the literal code, every command carries its expected output.

**Type consistency:** `deposited` and `returned` are spelled identically in Tasks 2, 3, 4. `BalanceRow`'s prop is `amount` in Task 4 Steps 3, 4, and 5. `totalDeposited` / `totalReturned` match between Task 1's definition, Task 1's export, and Task 2's import.
