import { describe, expect, it } from 'vitest'
import { formatRelativeFa } from './relative-fa'

describe('formatRelativeFa', () => {
  const now = new Date('2026-07-31T12:00:00.000Z')

  it('returns همین الان under 60 seconds', () => {
    expect(formatRelativeFa('2026-07-31T11:59:30.000Z', now)).toBe('همین الان')
  })

  it('returns minutes with fa digits', () => {
    expect(formatRelativeFa('2026-07-31T11:55:00.000Z', now)).toBe('۵ دقیقه پیش')
  })

  it('returns hours', () => {
    expect(formatRelativeFa('2026-07-31T09:00:00.000Z', now)).toBe('۳ ساعت پیش')
  })
})
