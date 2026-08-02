import { describe, expect, it } from 'vitest'
import { isSessionValid, type LocalSession } from './local-session'

const NOW = new Date('2026-08-02T12:00:00.000Z')

function session(expiresAt: string): LocalSession {
  return { expiresAt }
}

describe('isSessionValid', () => {
  it('rejects a missing session', () => {
    expect(isSessionValid(undefined, NOW)).toBe(false)
  })

  it('accepts a session that expires in the future', () => {
    expect(isSessionValid(session('2026-08-02T13:00:00.000Z'), NOW)).toBe(true)
  })

  it('rejects a session that expired in the past', () => {
    expect(isSessionValid(session('2026-08-02T11:00:00.000Z'), NOW)).toBe(false)
  })

  it('rejects a session that expires exactly now', () => {
    expect(isSessionValid(session('2026-08-02T12:00:00.000Z'), NOW)).toBe(false)
  })

  it('rejects an unparseable expiry rather than trusting it', () => {
    expect(isSessionValid(session('whenever'), NOW)).toBe(false)
  })
})
