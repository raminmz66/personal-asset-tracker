import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useNavigate } from 'react-router'
import { getOutbox, setOutbox, setSnapshot, type Snapshot } from './cache'
import { flushOutbox } from './flush'
import { enqueue } from './outbox'

export type MutateInput = {
  method: string
  path: string
  body?: unknown
}

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
  refresh: () => Promise<void>
  mutate: (input: MutateInput) => Promise<void>
}

const SyncContext = createContext<SyncContextValue | null>(null)

async function loadPendingCount(): Promise<number> {
  const queue = await getOutbox()
  return queue.length
}

export function SyncProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const [online, setOnline] = useState(() => navigator.onLine)
  const [pendingCount, setPendingCount] = useState(0)

  const forceLogin = useCallback(() => {
    navigate('/login', { replace: true })
  }, [navigate])

  const syncPendingCount = useCallback(async () => {
    setPendingCount(await loadPendingCount())
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

    await setSnapshot({
      people: doc.people,
      balances: doc.balances,
      transactions: doc.transactions,
      updatedAt: new Date().toISOString(),
    })
  }, [forceLogin])

  const mutate = useCallback(
    async (input: MutateInput) => {
      if (!navigator.onLine) {
        const queue = await getOutbox()
        const next = enqueue(queue, {
          id: crypto.randomUUID(),
          method: input.method,
          path: input.path,
          body: input.body ?? null,
        })
        await setOutbox(next)
        setPendingCount(next.length)
        return
      }

      const init: RequestInit = {
        method: input.method,
        credentials: 'include',
      }
      if (input.body !== undefined) {
        init.headers = { 'Content-Type': 'application/json' }
        init.body = JSON.stringify(input.body)
      }

      const res = await fetch(`/api${input.path}`, init)
      if (res.status === 401) {
        forceLogin()
        return
      }
      if (!res.ok) {
        let code = 'request_failed'
        try {
          const body = (await res.json()) as { error?: string }
          if (body.error) code = body.error
        } catch {
          /* empty body */
        }
        throw new MutateError(code)
      }

      await refresh()
    },
    [forceLogin, refresh],
  )

  const flush = useCallback(async () => {
    if (!navigator.onLine) return

    const result = await flushOutbox()
    await syncPendingCount()

    if (result.ok === false && result.reason === 'auth') {
      forceLogin()
      return
    }

    if (result.flushed > 0) {
      await refresh()
    }
  }, [forceLogin, refresh, syncPendingCount])

  useEffect(() => {
    void syncPendingCount()
  }, [syncPendingCount])

  useEffect(() => {
    if (online) {
      void flush()
    }
  }, [online, flush])

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

  const value = useMemo(
    () => ({ online, pendingCount, refresh, mutate }),
    [online, pendingCount, refresh, mutate],
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
