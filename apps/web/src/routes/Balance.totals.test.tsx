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
