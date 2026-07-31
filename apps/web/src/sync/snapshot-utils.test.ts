import { describe, expect, it } from 'vitest'
import {
  activeBalancesForPerson,
  activeCountForPerson,
  balanceDetailFromSnapshot,
  removePersonFromSnapshot,
  settledBalancesForPerson,
} from './snapshot-utils'
import type { Snapshot } from './cache'

const snapshot: Snapshot = {
  people: [
    { id: 'p1', name: 'الف', note: null, createdAt: 'x', updatedAt: 'x' },
    { id: 'p2', name: 'ب', note: null, createdAt: 'x', updatedAt: 'x' },
  ],
  balances: [
    { id: 'b1', personId: 'p1', label: 'تومان', createdAt: 'x', updatedAt: 'x' },
    { id: 'b2', personId: 'p1', label: 'دلار', createdAt: 'x', updatedAt: 'x' },
    { id: 'b3', personId: 'p2', label: 'تومان', createdAt: 'x', updatedAt: 'x' },
  ],
  transactions: [
    {
      id: 't1',
      balanceId: 'b1',
      type: 'deposit',
      amount: 10,
      date: 'd',
      note: null,
      createdAt: 'x',
      updatedAt: 'x',
    },
    {
      id: 't2',
      balanceId: 'b2',
      type: 'deposit',
      amount: 20,
      date: 'd',
      note: null,
      createdAt: 'x',
      updatedAt: 'x',
    },
    {
      id: 't3',
      balanceId: 'b3',
      type: 'deposit',
      amount: 30,
      date: 'd',
      note: null,
      createdAt: 'x',
      updatedAt: 'x',
    },
  ],
  updatedAt: 'x',
}

describe('removePersonFromSnapshot', () => {
  it('removes the person', () => {
    const next = removePersonFromSnapshot(snapshot, 'p1')
    expect(next.people.map((p) => p.id)).toEqual(['p2'])
  })

  it('removes that person’s balances', () => {
    const next = removePersonFromSnapshot(snapshot, 'p1')
    expect(next.balances.map((b) => b.id)).toEqual(['b3'])
  })

  it('removes transactions belonging to the removed balances', () => {
    const next = removePersonFromSnapshot(snapshot, 'p1')
    expect(next.transactions.map((t) => t.id)).toEqual(['t3'])
  })

  it('leaves other people untouched', () => {
    const next = removePersonFromSnapshot(snapshot, 'p1')
    expect(next.people).toHaveLength(1)
    expect(next.balances).toHaveLength(1)
    expect(next.transactions).toHaveLength(1)
  })

  it('is a no-op for an unknown person', () => {
    const next = removePersonFromSnapshot(snapshot, 'nope')
    expect(next.people).toHaveLength(2)
    expect(next.balances).toHaveLength(3)
    expect(next.transactions).toHaveLength(3)
  })

  it('does not mutate the input snapshot', () => {
    removePersonFromSnapshot(snapshot, 'p1')
    expect(snapshot.people).toHaveLength(2)
    expect(snapshot.balances).toHaveLength(3)
    expect(snapshot.transactions).toHaveLength(3)
  })
})

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
