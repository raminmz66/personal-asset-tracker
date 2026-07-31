import {
  balanceQuantity,
  isBalanceActive,
  isBalanceSettled,
  personShortStatus,
  type Transaction,
} from '@pat/domain'
import type { Snapshot } from './cache'

export type PersonListItem = {
  id: string
  name: string
  activeCount: number
  status: string
}

export type BalanceListItem = {
  id: string
  label: string
  quantity: number
}

export type BalanceDetailItem = {
  id: string
  personId: string
  personName: string
  label: string
  quantity: number
  transactions: Transaction[]
}

function sortTransactionsNewestFirst(txs: Transaction[]): Transaction[] {
  return [...txs].sort((a, b) => {
    const byDate = b.date.localeCompare(a.date)
    if (byDate !== 0) return byDate
    return b.createdAt.localeCompare(a.createdAt)
  })
}

export function balanceDetailFromSnapshot(
  snapshot: Snapshot,
  balanceId: string,
): BalanceDetailItem | null {
  const balance = snapshot.balances.find((b) => b.id === balanceId)
  if (!balance) return null

  const person = snapshot.people.find((p) => p.id === balance.personId)
  const txs = snapshot.transactions.filter((t) => t.balanceId === balanceId)

  return {
    id: balance.id,
    personId: balance.personId,
    personName: person?.name ?? '…',
    label: balance.label,
    quantity: balanceQuantity(txs),
    transactions: sortTransactionsNewestFirst(txs),
  }
}

export function activeCountForPerson(
  snapshot: Snapshot,
  personId: string,
): number {
  const balances = snapshot.balances.filter((b) => b.personId === personId)
  let count = 0
  for (const balance of balances) {
    const txs = snapshot.transactions.filter((t) => t.balanceId === balance.id)
    if (isBalanceActive(balanceQuantity(txs))) count++
  }
  return count
}

export function personFromSnapshot(
  snapshot: Snapshot,
  personId: string,
): { id: string; name: string } | undefined {
  const person = snapshot.people.find((p) => p.id === personId)
  if (!person) return undefined
  return { id: person.id, name: person.name }
}

export function activeBalancesForPerson(
  snapshot: Snapshot,
  personId: string,
): BalanceListItem[] {
  const balances = snapshot.balances.filter((b) => b.personId === personId)
  const items: BalanceListItem[] = []

  for (const balance of balances) {
    const txs = snapshot.transactions.filter((t) => t.balanceId === balance.id)
    const quantity = balanceQuantity(txs)
    if (isBalanceActive(quantity)) {
      items.push({ id: balance.id, label: balance.label, quantity })
    }
  }

  return items.sort((a, b) => a.label.localeCompare(b.label, 'fa'))
}

export function settledBalancesForPerson(
  snapshot: Snapshot,
  personId: string,
): BalanceListItem[] {
  const balances = snapshot.balances.filter((b) => b.personId === personId)
  const items: BalanceListItem[] = []

  for (const balance of balances) {
    const txs = snapshot.transactions.filter((t) => t.balanceId === balance.id)
    const quantity = balanceQuantity(txs)
    if (isBalanceSettled(quantity)) {
      items.push({ id: balance.id, label: balance.label, quantity })
    }
  }

  return items.sort((a, b) => a.label.localeCompare(b.label, 'fa'))
}

export function peopleFromSnapshot(snapshot: Snapshot): PersonListItem[] {
  return [...snapshot.people]
    .sort((a, b) => a.name.localeCompare(b.name, 'fa'))
    .map((person) => {
      const activeCount = activeCountForPerson(snapshot, person.id)
      return {
        id: person.id,
        name: person.name,
        activeCount,
        status: personShortStatus(activeCount),
      }
    })
}

/**
 * Prunes a person and everything beneath them from a cached snapshot,
 * mirroring the server's `ON DELETE CASCADE` from people → balances →
 * transactions. Returns new arrays; the input is not mutated.
 */
export function removePersonFromSnapshot(
  snapshot: Snapshot,
  personId: string,
): Pick<Snapshot, 'people' | 'balances' | 'transactions'> {
  const removedBalanceIds = new Set(
    snapshot.balances.filter((b) => b.personId === personId).map((b) => b.id),
  )
  return {
    people: snapshot.people.filter((p) => p.id !== personId),
    balances: snapshot.balances.filter((b) => b.personId !== personId),
    transactions: snapshot.transactions.filter(
      (t) => !removedBalanceIds.has(t.balanceId),
    ),
  }
}
