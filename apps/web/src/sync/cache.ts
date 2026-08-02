import type { Balance, Person, Transaction } from '@pat/domain'
import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { type OutboxEntry } from './outbox'

export const SNAPSHOT_KEY = 'pat:snapshot'
export const OUTBOX_KEY = 'pat:outbox'
export const SESSION_KEY = 'pat:session'

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

/** Generic accessors, so every store shares one database connection. */
export async function getKv<T>(key: string): Promise<T | undefined> {
  const db = await getDb()
  return (await db.get('kv', key)) as T | undefined
}

export async function setKv(key: string, value: unknown): Promise<void> {
  const db = await getDb()
  await db.put('kv', value, key)
}

export async function deleteKv(key: string): Promise<void> {
  const db = await getDb()
  await db.delete('kv', key)
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
