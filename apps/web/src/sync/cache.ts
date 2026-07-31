import type { Balance, Person, Transaction } from '@pat/domain'
import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { type OutboxEntry } from './outbox'

export const SNAPSHOT_KEY = 'pat:snapshot'
export const OUTBOX_KEY = 'pat:outbox'

export type Snapshot = {
  people: Person[]
  balances: Balance[]
  transactions: Transaction[]
  updatedAt: string
}

interface PatDB extends DBSchema {
  kv: {
    key: string
    value: unknown
  }
}

let dbPromise: Promise<IDBPDatabase<PatDB>> | undefined

function getDb(): Promise<IDBPDatabase<PatDB>> {
  if (!dbPromise) {
    dbPromise = openDB<PatDB>('pat', 1, {
      upgrade(db) {
        db.createObjectStore('kv')
      },
    })
  }
  return dbPromise
}

export async function getSnapshot(): Promise<Snapshot | undefined> {
  const db = await getDb()
  return (await db.get('kv', SNAPSHOT_KEY)) as Snapshot | undefined
}

export async function setSnapshot(snapshot: Snapshot): Promise<void> {
  const db = await getDb()
  await db.put('kv', snapshot, SNAPSHOT_KEY)
}

export async function getOutbox(): Promise<OutboxEntry[]> {
  const db = await getDb()
  return ((await db.get('kv', OUTBOX_KEY)) as OutboxEntry[] | undefined) ?? []
}

export async function setOutbox(queue: OutboxEntry[]): Promise<void> {
  const db = await getDb()
  await db.put('kv', queue, OUTBOX_KEY)
}
