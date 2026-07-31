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

/** One person, one balance carrying `transactions`. */
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
