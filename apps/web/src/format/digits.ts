const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹'

/** U+066C ARABIC THOUSANDS SEPARATOR — the grouping mark used in Persian. */
const FA_GROUP_SEP = '٬'

/** Matches a digit in any of the three sets the app accepts. */
export const DIGIT_RE = /[0-9۰-۹٠-٩]/

/** Latin digits → Persian digits. Non-digits pass through untouched. */
export function toFaDigits(value: number | string): string {
  return String(value).replace(/\d/g, (d) => FA_DIGITS[Number(d)]!)
}

/** Persian (U+06F0–9) and Arabic-Indic (U+0660–9) digits → Latin digits. */
export function toLatinDigits(value: string): string {
  return value.replace(/[۰-۹٠-٩]/g, (ch) => {
    const code = ch.charCodeAt(0)
    // Persian block first, then Arabic-Indic.
    return code >= 0x06f0 ? String(code - 0x06f0) : String(code - 0x0660)
  })
}

/**
 * Reduces arbitrary input to the canonical stored form: Latin digits only,
 * no leading zeros. Empty input — and input with no digits, or only zeros —
 * yields `''` rather than `'0'`, since an amount must be greater than zero.
 */
export function canonicalAmount(raw: string): string {
  return toLatinDigits(raw).replace(/\D/g, '').replace(/^0+/, '')
}

/** `'1234567'` → `'1,234,567'`. */
export function groupThousands(latinDigits: string): string {
  return latinDigits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/** Display form: Persian digits grouped with `٬`. */
export function formatAmountInput(raw: string): string {
  const canonical = canonicalAmount(raw)
  if (canonical === '') return ''
  return toFaDigits(groupThousands(canonical)).replaceAll(',', FA_GROUP_SEP)
}

/** Numeric value of any amount input form. `0` when empty. */
export function parseAmountInput(raw: string): number {
  const canonical = canonicalAmount(raw)
  return canonical === '' ? 0 : Number(canonical)
}
