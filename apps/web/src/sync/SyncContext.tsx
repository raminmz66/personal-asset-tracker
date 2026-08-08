import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useNavigate } from 'react-router'
import { clearLocalSession } from '../auth/local-session'
import {
  getFailed,
  getOutbox,
  getSnapshot,
  setFailed,
  setOutbox,
  setSnapshot,
  type Snapshot,
} from './cache'
import { flushOutbox } from './flush'
import { type FailedEntry } from './flush-policy'
import { classifyMutate } from './mutate-policy'
import { enqueue } from './outbox'

export type MutateInput = {
  method: string
  path: string
  body?: unknown
}

/**
 * `queued` is the signal callers use to decide whether to write an optimistic
 * row into the local snapshot. It is not the same as being offline: a write can
 * queue while `navigator.onLine` is true.
 */
export type MutateResult = { queued: boolean }

export class MutateError extends Error {
  code: string

  constructor(code: string) {
    super(code)
    this.name = 'MutateError'
    this.code = code
  }
}

export type SyncContextValue = {
  online: boolean
  pendingCount: number
  failedEntries: FailedEntry[]
  failedCount: number
  lastSyncedAt: string | null
  refresh: () => Promise<void>
  mutate: (input: MutateInput) => Promise<MutateResult>
  clearOutbox: () => Promise<void>
  discardFailed: (id: string) => Promise<void>
  discardAllFailed: () => Promise<void>
}

const SyncContext = createContext<SyncContextValue | null>(null)

/**
 * How often to re-attempt a drain that still has entries.
 *
 * `navigator.onLine` only reports whether the device has a network, not whether
 * the server can be reached, so the online event alone leaves writes queued
 * whenever the queue filled up without the flag ever changing. The timer only
 * runs while something is actually waiting.
 */
export const RETRY_INTERVAL_MS = 30_000

async function loadPendingCount(): Promise<number> {
  const queue = await getOutbox()
  return queue.length
}

export function SyncProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const [online, setOnline] = useState(() => navigator.onLine)
  const [pendingCount, setPendingCount] = useState(0)
  const [failedEntries, setFailedEntries] = useState<FailedEntry[]>([])
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)

  const forceLogin = useCallback(() => {
    // Only the marker: an expired cookie must not destroy unsynced work, which
    // still flushes after the next login.
    void clearLocalSession()
    navigate('/login', { replace: true })
  }, [navigate])

  // Several async chains report the queue length, and they do not finish in the
  // order they started. Without a generation stamp a slow read can land after a
  // newer one and leave the banner contradicting the queue it describes.
  const countSeq = useRef(0)

  const publishPendingCount = useCallback((count: number) => {
    countSeq.current += 1
    setPendingCount(count)
  }, [])

  const syncPendingCount = useCallback(async () => {
    const seq = countSeq.current
    const count = await loadPendingCount()
    if (seq === countSeq.current) {
      countSeq.current += 1
      setPendingCount(count)
    }
  }, [])

  const syncFailed = useCallback(async () => {
    setFailedEntries(await getFailed())
  }, [])

  const refresh = useCallback(async () => {
    if (!navigator.onLine) return

    const res = await fetch('/api/backup/export', { credentials: 'include' })
    if (res.status === 401) {
      forceLogin()
      return
    }
    if (!res.ok) {
      throw new Error('refresh_failed')
    }

    const doc = (await res.json()) as Pick<
      Snapshot,
      'people' | 'balances' | 'transactions'
    >

    const updatedAt = new Date().toISOString()
    await setSnapshot({
      people: doc.people,
      balances: doc.balances,
      transactions: doc.transactions,
      updatedAt,
    })
    setLastSyncedAt(updatedAt)
  }, [forceLogin])

  const queueWrite = useCallback(
    async (input: MutateInput) => {
      const queue = await getOutbox()
      const next = enqueue(queue, {
        id: crypto.randomUUID(),
        method: input.method,
        path: input.path,
        body: input.body ?? null,
      })
      await setOutbox(next)
      publishPendingCount(next.length)
    },
    [publishPendingCount],
  )

  const mutate = useCallback(
    async (input: MutateInput): Promise<MutateResult> => {
      if (!navigator.onLine) {
        await queueWrite(input)
        return { queued: true }
      }

      const init: RequestInit = {
        method: input.method,
        credentials: 'include',
      }
      if (input.body !== undefined) {
        init.headers = { 'Content-Type': 'application/json' }
        init.body = JSON.stringify(input.body)
      }

      let res: Response
      try {
        res = await fetch(`/api${input.path}`, init)
      } catch {
        // navigator.onLine said yes but nothing arrived: captive portal, dead
        // Worker, flaky signal. Queue it rather than lose the write.
        await queueWrite(input)
        return { queued: true }
      }

      switch (classifyMutate(res.status)) {
        case 'queue':
          await queueWrite(input)
          return { queued: true }
        case 'auth':
          forceLogin()
          return { queued: false }
        case 'error': {
          let code = 'request_failed'
          try {
            const body = (await res.json()) as { error?: string }
            if (body.error) code = body.error
          } catch {
            /* empty body */
          }
          throw new MutateError(code)
        }
        case 'ok':
          // The write landed. A refresh that fails afterwards is a stale view,
          // not a failed write, and must not be reported as one.
          try {
            await refresh()
          } catch {
            /* keep the cached snapshot */
          }
          return { queued: false }
      }
    },
    [forceLogin, queueWrite, refresh],
  )

  // The drain is triggered from several places at once — reconnect, foreground,
  // the retry timer. Letting two run together would have them both read the same
  // head and race their writes back to the queue.
  const flushing = useRef(false)

  const flush = useCallback(async () => {
    if (!navigator.onLine) return
    if (flushing.current) return
    flushing.current = true

    try {
      const result = await flushOutbox()
      await syncPendingCount()
      await syncFailed()

      if (result.ok === false && result.reason === 'auth') {
        forceLogin()
        return
      }

      if (result.flushed > 0) {
        await refresh()
      }
    } finally {
      flushing.current = false
    }
  }, [forceLogin, refresh, syncFailed, syncPendingCount])

  useEffect(() => {
    void syncPendingCount()
    void syncFailed()
  }, [syncFailed, syncPendingCount])

  useEffect(() => {
    let cancelled = false
    void getSnapshot().then((snapshot) => {
      if (!cancelled && snapshot?.updatedAt) {
        setLastSyncedAt(snapshot.updatedAt)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (online) {
      void flush()
    }
  }, [online, flush])

  // Coming back to the app is the moment the user expects their work to be on
  // its way, and it is also when a phone that slept through the online event
  // gets its only chance to notice the network returned.
  useEffect(() => {
    const onWake = () => {
      if (document.visibilityState === 'visible') {
        setOnline(navigator.onLine)
        void flush()
      }
    }

    document.addEventListener('visibilitychange', onWake)
    window.addEventListener('focus', onWake)
    return () => {
      document.removeEventListener('visibilitychange', onWake)
      window.removeEventListener('focus', onWake)
    }
  }, [flush])

  // A drain that stopped on a retryable answer — a 5xx, a rate limit, a dropped
  // connection — has no other way back. The timer exists only while the queue
  // has something in it, so an idle app does no polling at all.
  useEffect(() => {
    if (!online || pendingCount === 0) return

    const id = setInterval(() => {
      void flush()
    }, RETRY_INTERVAL_MS)
    return () => clearInterval(id)
  }, [online, pendingCount, flush])

  useEffect(() => {
    const onOnline = () => setOnline(true)
    const onOffline = () => setOnline(false)

    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  const clearOutbox = useCallback(async () => {
    await setOutbox([])
    publishPendingCount(0)
  }, [publishPendingCount])

  const discardFailed = useCallback(async (id: string) => {
    const next = (await getFailed()).filter((entry) => entry.id !== id)
    await setFailed(next)
    setFailedEntries(next)
  }, [])

  const discardAllFailed = useCallback(async () => {
    await setFailed([])
    setFailedEntries([])
  }, [])

  const value = useMemo(
    () => ({
      online,
      pendingCount,
      failedEntries,
      failedCount: failedEntries.length,
      lastSyncedAt,
      refresh,
      mutate,
      clearOutbox,
      discardFailed,
      discardAllFailed,
    }),
    [
      online,
      pendingCount,
      failedEntries,
      lastSyncedAt,
      refresh,
      mutate,
      clearOutbox,
      discardFailed,
      discardAllFailed,
    ],
  )

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>
}

export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext)
  if (!ctx) {
    throw new Error('useSync must be used within SyncProvider')
  }
  return ctx
}
