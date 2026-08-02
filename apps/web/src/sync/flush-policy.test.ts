import { describe, expect, it } from 'vitest'
import {
  applyFlushDecision,
  classifyFlush,
  type FailedEntry,
} from './flush-policy'
import type { OutboxEntry } from './outbox'

function entry(id: string): OutboxEntry {
  return { id, method: 'POST', path: '/people', body: null }
}

const META = { status: 400, error: 'invalid_name', failedAt: '2026-08-02T00:00:00.000Z' }

describe('classifyFlush', () => {
  it.each([200, 201, 204])('drops %i', (status) => {
    expect(classifyFlush(status, 'POST')).toBe('drop')
  })

  it.each(['DELETE', 'PATCH'])(
    'drops a 404 on %s — the row is already gone',
    (method) => {
      expect(classifyFlush(404, method)).toBe('drop')
    },
  )

  it('parks a 404 on POST — the parent it needs does not exist', () => {
    expect(classifyFlush(404, 'POST')).toBe('park')
  })

  it('sends 401 to the auth path', () => {
    expect(classifyFlush(401, 'POST')).toBe('auth')
  })

  it.each([0, 408, 429, 500, 502, 503])('retries %i', (status) => {
    expect(classifyFlush(status, 'POST')).toBe('retry')
  })

  it.each([400, 403, 409, 422])('parks %i', (status) => {
    expect(classifyFlush(status, 'POST')).toBe('park')
  })
})

describe('applyFlushDecision', () => {
  const state = { queue: [entry('a'), entry('b')], failed: [] as FailedEntry[] }

  it('drop advances the head and keeps draining', () => {
    const next = applyFlushDecision(state, 'drop', META)
    expect(next.queue.map((e) => e.id)).toEqual(['b'])
    expect(next.failed).toEqual([])
    expect(next.stop).toBe(false)
  })

  it('park moves the head aside and keeps draining', () => {
    const next = applyFlushDecision(state, 'park', META)
    expect(next.queue.map((e) => e.id)).toEqual(['b'])
    expect(next.failed).toHaveLength(1)
    expect(next.failed[0].id).toBe('a')
    expect(next.failed[0].status).toBe(400)
    expect(next.stop).toBe(false)
  })

  it('retry leaves the queue untouched and stops', () => {
    const next = applyFlushDecision(state, 'retry', META)
    expect(next.queue.map((e) => e.id)).toEqual(['a', 'b'])
    expect(next.stop).toBe(true)
  })

  it('auth leaves the queue untouched and stops', () => {
    const next = applyFlushDecision(state, 'auth', META)
    expect(next.queue.map((e) => e.id)).toEqual(['a', 'b'])
    expect(next.stop).toBe(true)
  })

  it('stops on an empty queue', () => {
    const next = applyFlushDecision({ queue: [], failed: [] }, 'drop', META)
    expect(next.stop).toBe(true)
  })

  it('a dead entry does not block the ones behind it', () => {
    // The regression this whole module exists for.
    let current = { queue: [entry('dead'), entry('good')], failed: [] as FailedEntry[] }
    current = applyFlushDecision(current, 'park', META)
    current = applyFlushDecision(current, 'drop', META)
    expect(current.queue).toEqual([])
    expect(current.failed.map((e) => e.id)).toEqual(['dead'])
  })
})
