import type { ReactNode } from 'react'
import type { Transaction } from '@pat/domain'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from '@testing-library/react'
import type { Snapshot } from '../sync/cache'

const { mutateMock, navigateMock, getSnapshotMock, setSnapshotMock } =
  vi.hoisted(() => ({
    mutateMock: vi.fn(),
    navigateMock: vi.fn(),
    getSnapshotMock: vi.fn(),
    setSnapshotMock: vi.fn(),
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
    mutate: mutateMock,
    clearOutbox: vi.fn(),
  }),
}))

vi.mock('../sync/cache', () => ({
  getSnapshot: getSnapshotMock,
  setSnapshot: setSnapshotMock,
}))

import { Person } from './Person'

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

/** One person with one balance carrying the given transactions. */
function snapshotWith(transactions: Transaction[]): Snapshot {
  return {
    people: [
      { id: 'p1', name: 'الف', note: null, createdAt: 'x', updatedAt: 'x' },
    ],
    balances: [
      {
        id: 'b1',
        personId: 'p1',
        label: 'تومان',
        createdAt: 'x',
        updatedAt: 'x',
      },
    ],
    transactions,
    updatedAt: 'x',
  }
}

describe('Person delete', () => {
  beforeEach(() => {
    mutateMock.mockReset().mockResolvedValue({ queued: false })
    navigateMock.mockReset()
    setSnapshotMock.mockReset().mockResolvedValue(undefined)
    getSnapshotMock.mockReset()
  })
  afterEach(() => cleanup())

  it('hides delete and shows a hint while a balance is active', async () => {
    // A deposit with no return leaves quantity 100 → active.
    getSnapshotMock.mockResolvedValue(snapshotWith([tx('t1', 'deposit', 100)]))
    render(<Person />)

    await waitFor(() => {
      expect(
        screen.getByText('برای حذف، اول موجودی‌ها را تسویه کن'),
      ).toBeTruthy()
    })
    expect(screen.queryByRole('button', { name: 'حذف شخص' })).toBe(null)
  })

  it('offers delete when nothing is active, and needs two taps', async () => {
    // Deposit fully returned leaves quantity 0 → settled, so activeCount is 0.
    getSnapshotMock.mockResolvedValue(
      snapshotWith([tx('t1', 'deposit', 50), tx('t2', 'return', 50)]),
    )
    render(<Person />)

    const btn = await waitFor(() =>
      screen.getByRole('button', { name: 'حذف شخص' }),
    )
    fireEvent.click(btn)
    expect(mutateMock).not.toHaveBeenCalled()

    // Armed label reports the settled-balance count.
    fireEvent.click(
      screen.getByRole('button', { name: '۱ موجودی تسویه‌شده حذف شود؟' }),
    )

    await waitFor(() => {
      expect(mutateMock).toHaveBeenCalledWith({
        method: 'DELETE',
        path: '/people/p1',
      })
    })
    expect(navigateMock).toHaveBeenCalledWith('/', { replace: true })
  })

  it('offers delete with a plain confirm when there is no history at all', async () => {
    getSnapshotMock.mockResolvedValue({
      people: [
        { id: 'p1', name: 'الف', note: null, createdAt: 'x', updatedAt: 'x' },
      ],
      balances: [],
      transactions: [],
      updatedAt: 'x',
    })
    render(<Person />)

    const btn = await waitFor(() =>
      screen.getByRole('button', { name: 'حذف شخص' }),
    )
    fireEvent.click(btn)
    expect(
      screen.getByRole('button', { name: 'مطمئنی؟ دوباره بزن' }),
    ).toBeTruthy()
  })

  it('does not write the snapshot when the write reached the server', async () => {
    getSnapshotMock.mockResolvedValue(
      snapshotWith([tx('t1', 'deposit', 50), tx('t2', 'return', 50)]),
    )
    render(<Person />)

    fireEvent.click(
      await waitFor(() => screen.getByRole('button', { name: 'حذف شخص' })),
    )
    fireEvent.click(
      screen.getByRole('button', { name: '۱ موجودی تسویه‌شده حذف شود؟' }),
    )

    await waitFor(() => expect(mutateMock).toHaveBeenCalled())
    expect(setSnapshotMock).not.toHaveBeenCalled()
  })

  it('writes the snapshot whenever the write was queued, online or not', async () => {
    // The point of the { queued } contract: navigator.onLine is still true
    // here, but the server was unreachable, so the row must vanish locally.
    mutateMock.mockResolvedValue({ queued: true })
    getSnapshotMock.mockResolvedValue(
      snapshotWith([tx('t1', 'deposit', 50), tx('t2', 'return', 50)]),
    )
    render(<Person />)

    fireEvent.click(
      await waitFor(() => screen.getByRole('button', { name: 'حذف شخص' })),
    )
    fireEvent.click(
      screen.getByRole('button', { name: '۱ موجودی تسویه‌شده حذف شود؟' }),
    )

    await waitFor(() => expect(setSnapshotMock).toHaveBeenCalled())
    const written = setSnapshotMock.mock.calls[0][0] as { people: unknown[] }
    expect(written.people).toEqual([])
  })
})
