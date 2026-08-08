import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OutboxEntry } from './outbox'

const { navigateMock } = vi.hoisted(() => ({ navigateMock: vi.fn() }))

vi.mock('react-router', () => ({
  useNavigate: () => navigateMock,
}))

vi.mock('../auth/local-session', () => ({
  clearLocalSession: vi.fn().mockResolvedValue(undefined),
}))

/** In-memory stand-in for the IndexedDB kv store. */
const store: { outbox: OutboxEntry[]; failed: unknown[]; snapshot?: unknown } = {
  outbox: [],
  failed: [],
}

/**
 * Delays only the first outbox read, which is how a slow IndexedDB reproduces
 * the ordering race: the mount-time count read resolves after a later write has
 * already reported a newer count.
 */
let firstReadDelayMs = 0
let readCount = 0

vi.mock('./cache', () => ({
  getOutbox: async () => {
    readCount += 1
    // Snapshot at read time, as a real IndexedDB read does — a slow read hands
    // back what the queue held when it started, not what it holds on arrival.
    const atReadTime = store.outbox
    if (readCount === 1 && firstReadDelayMs > 0) {
      await new Promise((r) => setTimeout(r, firstReadDelayMs))
    }
    return atReadTime
  },
  setOutbox: async (q: OutboxEntry[]) => {
    store.outbox = q
  },
  getFailed: async () => store.failed,
  setFailed: async (f: unknown[]) => {
    store.failed = f
  },
  getSnapshot: async () => store.snapshot,
  setSnapshot: async (s: unknown) => {
    store.snapshot = s
  },
}))

import { RETRY_INTERVAL_MS, SyncProvider, useSync } from './SyncContext'

type Mutate = (input: {
  method: string
  path: string
  body?: unknown
}) => Promise<{ queued: boolean }>

let mutate: Mutate

function Probe() {
  const sync = useSync()
  mutate = sync.mutate
  return (
    <div>
      <span data-testid="online">{String(sync.online)}</span>
      <span data-testid="pending">{sync.pendingCount}</span>
    </div>
  )
}

function setOnLine(value: boolean) {
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    get: () => value,
  })
}

function entry(id: string, name: string): OutboxEntry {
  return { id, method: 'POST', path: '/people', body: { id, name } }
}

/**
 * A server that can be switched between reachable, unreachable and broken, so a
 * test can recover it without touching `navigator.onLine`.
 */
function stubServer(state: { mode: 'up' | 'unreachable' | 'error' }) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/backup/export')) {
      return new Response(
        JSON.stringify({ people: [], balances: [], transactions: [] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }
    if (state.mode === 'unreachable') throw new TypeError('Failed to fetch')
    if (state.mode === 'error') return new Response('{}', { status: 500 })
    return new Response(JSON.stringify({ ok: true }), { status: 201 })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function settle(ms = 50) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms))
  })
}

describe('draining the outbox once the server is reachable again', () => {
  beforeEach(() => {
    store.outbox = []
    store.failed = []
    store.snapshot = undefined
    firstReadDelayMs = 0
    readCount = 0
    navigateMock.mockReset()
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('flushes when the online event fires', async () => {
    store.outbox = [entry('e1', 'الف'), entry('e2', 'ب')]
    setOnLine(false)
    stubServer({ mode: 'up' })

    render(
      <SyncProvider>
        <Probe />
      </SyncProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('pending').textContent).toBe('2')
    })

    setOnLine(true)
    await act(async () => {
      window.dispatchEvent(new Event('online'))
    })

    await waitFor(() => {
      expect(screen.getByTestId('pending').textContent).toBe('0')
    })
    expect(store.outbox).toEqual([])
  })

  it('retries a write queued while navigator.onLine was already true', async () => {
    // The device never lost its network: the server was simply unreachable, so
    // no online event will ever arrive to prompt a retry.
    setOnLine(true)
    const server = { mode: 'unreachable' as 'up' | 'unreachable' | 'error' }
    stubServer(server)

    vi.useFakeTimers({ shouldAdvanceTime: true })

    render(
      <SyncProvider>
        <Probe />
      </SyncProvider>,
    )

    await act(async () => {
      await mutate({ method: 'POST', path: '/people', body: { name: 'الف' } })
    })

    await waitFor(() => {
      expect(store.outbox).toHaveLength(1)
    })
    expect(screen.getByTestId('pending').textContent).toBe('1')

    server.mode = 'up'
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS + 100)
    })

    expect(store.outbox).toEqual([])
    expect(screen.getByTestId('pending').textContent).toBe('0')
  })

  it('retries after a transient server error stopped the drain', async () => {
    store.outbox = [entry('e1', 'الف')]
    setOnLine(false)
    const server = { mode: 'error' as 'up' | 'unreachable' | 'error' }
    stubServer(server)

    vi.useFakeTimers({ shouldAdvanceTime: true })

    render(
      <SyncProvider>
        <Probe />
      </SyncProvider>,
    )

    setOnLine(true)
    await act(async () => {
      window.dispatchEvent(new Event('online'))
      await vi.advanceTimersByTimeAsync(20)
    })

    // The 500 is retryable, so the entry stays queued rather than being parked.
    expect(store.outbox).toHaveLength(1)
    expect(store.failed).toHaveLength(0)

    server.mode = 'up'
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS + 100)
    })

    expect(store.outbox).toEqual([])
    expect(screen.getByTestId('pending').textContent).toBe('0')
  })

  it('flushes when the app returns to the foreground', async () => {
    setOnLine(true)
    const server = { mode: 'unreachable' as 'up' | 'unreachable' | 'error' }
    stubServer(server)

    render(
      <SyncProvider>
        <Probe />
      </SyncProvider>,
    )

    await act(async () => {
      await mutate({ method: 'POST', path: '/people', body: { name: 'الف' } })
    })
    await waitFor(() => {
      expect(store.outbox).toHaveLength(1)
    })

    // A phone that slept through the reconnect gets no online event; returning
    // to the app is the only signal there is.
    server.mode = 'up'
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await settle()

    expect(store.outbox).toEqual([])
    expect(screen.getByTestId('pending').textContent).toBe('0')
  })

  it('keeps the reported count consistent with the queue', async () => {
    // A queued write racing the mount-time count read must not be erased by it.
    setOnLine(true)
    firstReadDelayMs = 150
    const server = { mode: 'unreachable' as 'up' | 'unreachable' | 'error' }
    stubServer(server)

    render(
      <SyncProvider>
        <Probe />
      </SyncProvider>,
    )

    await act(async () => {
      await mutate({ method: 'POST', path: '/people', body: { name: 'الف' } })
    })
    await settle(300)

    expect(store.outbox).toHaveLength(1)
    expect(screen.getByTestId('pending').textContent).toBe('1')
  })
})
