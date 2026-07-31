import {
  balanceQuantity,
  isBalanceActive,
  personShortStatus,
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
