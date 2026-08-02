import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, OFFLINE_STATUS } from './client'

const realFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = realFetch
  vi.restoreAllMocks()
})

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('authFetch', () => {
  it('reports status 0 when the network rejects', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))

    const result = await api.status()

    expect(result).toEqual({
      ok: false,
      status: OFFLINE_STATUS,
      error: 'offline',
    })
  })

  it('still reports the server error code when the server answers', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: 'invalid_credentials' }, 401))

    const result = await api.login('nope')

    expect(result).toEqual({
      ok: false,
      status: 401,
      error: 'invalid_credentials',
    })
  })
})

describe('apiFetch', () => {
  it('reports status 0 when the network rejects', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))

    const result = await api.people.list()

    expect(result).toEqual({
      ok: false,
      status: OFFLINE_STATUS,
      error: 'offline',
    })
  })

  it('passes a server error through untouched', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: 'over_return' }, 400))

    const result = await api.transactions.create('b1', {
      type: 'return',
      amount: 10,
      date: '2026-08-02',
    })

    expect(result).toEqual({ ok: false, status: 400, error: 'over_return' })
  })
})

describe('exportBackup', () => {
  it('reports status 0 when the network rejects', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))

    const result = await api.exportBackup()

    expect(result).toEqual({
      ok: false,
      status: OFFLINE_STATUS,
      error: 'offline',
    })
  })
})
