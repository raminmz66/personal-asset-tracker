import { describe, expect, it } from 'vitest'
import {
  canonicalAmount,
  formatAmountInput,
  groupThousands,
  parseAmountInput,
  toFaDigits,
  toLatinDigits,
} from './digits'

describe('toFaDigits', () => {
  it('converts Latin digits and leaves other characters alone', () => {
    expect(toFaDigits('1234')).toBe('۱۲۳۴')
    expect(toFaDigits(1234)).toBe('۱۲۳۴')
    expect(toFaDigits('1,234')).toBe('۱,۲۳۴')
  })
})

describe('toLatinDigits', () => {
  it('normalizes Persian digits', () => {
    expect(toLatinDigits('۱۲۳۴۵۶۷۸۹۰')).toBe('1234567890')
  })

  it('normalizes Arabic-Indic digits', () => {
    expect(toLatinDigits('١٢٣٤٥٦٧٨٩٠')).toBe('1234567890')
  })

  it('normalizes mixed digit sets', () => {
    expect(toLatinDigits('۱2٣4')).toBe('1234')
  })
})

describe('canonicalAmount', () => {
  it('keeps only digits', () => {
    expect(canonicalAmount('1a2ب3٬4')).toBe('1234')
  })

  it('strips leading zeros', () => {
    expect(canonicalAmount('007')).toBe('7')
  })

  it('returns empty for empty and for zero-only input', () => {
    expect(canonicalAmount('')).toBe('')
    expect(canonicalAmount('0')).toBe('')
    expect(canonicalAmount('abc')).toBe('')
  })

  it('normalizes Persian digits to Latin', () => {
    expect(canonicalAmount('۱۲۳')).toBe('123')
  })

  it('rejects a decimal separator, keeping only digits', () => {
    expect(canonicalAmount('123.45')).toBe('12345')
  })
})

describe('groupThousands', () => {
  it('groups by threes from the right', () => {
    expect(groupThousands('')).toBe('')
    expect(groupThousands('1')).toBe('1')
    expect(groupThousands('123')).toBe('123')
    expect(groupThousands('1234')).toBe('1,234')
    expect(groupThousands('1234567')).toBe('1,234,567')
  })
})

describe('formatAmountInput', () => {
  it('renders Persian digits grouped with the Persian separator', () => {
    expect(formatAmountInput('1234567')).toBe('۱٬۲۳۴٬۵۶۷')
  })

  it('keeps empty input empty', () => {
    expect(formatAmountInput('')).toBe('')
  })

  it('strips non-digits and leading zeros', () => {
    expect(formatAmountInput('00 12a34')).toBe('۱٬۲۳۴')
  })

  it('is idempotent over its own output', () => {
    expect(formatAmountInput(formatAmountInput('1234567'))).toBe('۱٬۲۳۴٬۵۶۷')
  })
})

describe('parseAmountInput', () => {
  it('parses grouped Persian input back to a number', () => {
    expect(parseAmountInput('۱٬۲۳۴٬۵۶۷')).toBe(1234567)
  })

  it('returns 0 for empty', () => {
    expect(parseAmountInput('')).toBe(0)
  })

  it('handles large values without precision loss', () => {
    expect(parseAmountInput('999999999999')).toBe(999999999999)
    expect(formatAmountInput('999999999999')).toBe('۹۹۹٬۹۹۹٬۹۹۹٬۹۹۹')
  })
})
