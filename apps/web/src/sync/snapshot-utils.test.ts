import { describe, expect, it } from 'vitest'
import { removePersonFromSnapshot } from './snapshot-utils'
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
