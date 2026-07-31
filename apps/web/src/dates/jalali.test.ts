import { describe, expect, it } from 'vitest'
import {
  buildJalaliMonthGrid,
  formatGregorianToJalali,
  formatJalali,
  formatJalaliParts,
  jalaliMonthLabel,
  parseJalaliParts,
  parseJalaliToGregorian,
  shiftJalaliMonth,
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

describe('parseJalaliParts', () => {
  it('parses a valid Jalali date', () => {
    expect(parseJalaliParts('1404/05/10')).toEqual({
      year: 1404,
      month: 5,
      day: 10,
    })
  })

  it('returns null for invalid input', () => {
    expect(parseJalaliParts('bad')).toBeNull()
  })
})

describe('formatJalaliParts', () => {
  it('zero-pads month and day', () => {
    expect(formatJalaliParts(1404, 5, 10)).toBe('1404/05/10')
  })
})

describe('shiftJalaliMonth', () => {
  it('moves forward one month', () => {
    expect(shiftJalaliMonth('1404/05/10', 1)).toBe('1404/06/01')
  })

  it('moves back across year boundary', () => {
    expect(shiftJalaliMonth('1404/01/15', -1)).toBe('1403/12/01')
  })
})

describe('jalaliMonthLabel', () => {
  it('returns Persian month and year', () => {
    expect(jalaliMonthLabel('1404/05/10')).toBe('مرداد ۱۴۰۴')
  })
})

describe('buildJalaliMonthGrid', () => {
  it('includes the 1st and last day of the month', () => {
    const cells = buildJalaliMonthGrid('1404/05/10')
    expect(cells.some((c) => c.jalali === '1404/05/01' && c.inMonth)).toBe(
      true,
    )
    expect(cells.some((c) => c.jalali === '1404/05/31' && c.inMonth)).toBe(
      true,
    )
  })

  it('pads to a multiple of 7', () => {
    const cells = buildJalaliMonthGrid('1404/05/10')
    expect(cells.length % 7).toBe(0)
    expect(cells.length).toBeGreaterThanOrEqual(28)
  })
})
