import { describe, expect, it } from 'vitest'
import {
  formatGregorianToJalali,
  formatJalali,
  parseJalaliToGregorian,
  todayGregorian,
  todayJalali,
} from './jalali'

describe('todayGregorian', () => {
  it('returns today as Gregorian YYYY-MM-DD', () => {
    const result = todayGregorian()
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(result).toBe(new Date().toISOString().slice(0, 10))
  })
})

describe('formatGregorianToJalali', () => {
  it('formats a known Gregorian date to Jalali', () => {
    expect(formatGregorianToJalali('2024-03-20')).toBe('1403/01/01')
  })

  it('formats another known Gregorian date to Jalali', () => {
    expect(formatGregorianToJalali('2025-07-31')).toBe('1404/05/10')
  })
})

describe('todayJalali', () => {
  it('returns today as Jalali YYYY/MM/DD', () => {
    const result = todayJalali()
    expect(result).toMatch(/^\d{4}\/\d{2}\/\d{2}$/)
    expect(result).toBe(formatGregorianToJalali(todayGregorian()))
  })
})

describe('formatJalali', () => {
  it('formats a known Gregorian date as readable Jalali', () => {
    expect(formatJalali('2025-07-31')).toBe('۱۰ مرداد ۱۴۰۴')
  })
})

describe('parseJalaliToGregorian', () => {
  it('parses a known Jalali date to Gregorian', () => {
    expect(parseJalaliToGregorian('1404/05/10')).toBe('2025-07-31')
  })

  it('returns null for invalid format', () => {
    expect(parseJalaliToGregorian('1404-05-10')).toBeNull()
    expect(parseJalaliToGregorian('')).toBeNull()
  })
})
