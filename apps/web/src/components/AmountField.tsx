import type { ChangeEvent } from 'react'
import { DIGIT_RE, canonicalAmount, formatAmountInput } from '../format/digits'

export type AmountFieldProps = {
  value: string
  onChange: (next: string) => void
  placeholder?: string
  disabled?: boolean
  required?: boolean
  autoFocus?: boolean
  className?: string
}

/** Number of digit characters in `text` before index `end`. */
function digitsBefore(text: string, end: number): number {
  let count = 0
  for (let i = 0; i < end && i < text.length; i++) {
    if (DIGIT_RE.test(text[i]!)) count++
  }
  return count
}

/** Offset in `text` just past the `count`-th digit. */
function offsetAfterDigits(text: string, count: number): number {
  if (count <= 0) return 0
  let seen = 0
  for (let i = 0; i < text.length; i++) {
    if (DIGIT_RE.test(text[i]!)) {
      seen++
      if (seen === count) return i + 1
    }
  }
  return text.length
}

export function AmountField({
  value,
  onChange,
  placeholder,
  disabled = false,
  required = false,
  autoFocus = false,
  className,
}: AmountFieldProps) {
  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const el = e.target
    const raw = el.value
    const caret = el.selectionStart ?? raw.length
    const digitsLeft = digitsBefore(raw, caret)

    const next = canonicalAmount(raw)
    const nextDisplay = formatAmountInput(next)

    // Sync the DOM synchronously: a rejected keystroke leaves `next`
    // unchanged, so React would not re-render and the stray character
    // would stay on screen.
    el.value = nextDisplay
    const nextCaret = offsetAfterDigits(nextDisplay, digitsLeft)
    el.setSelectionRange(nextCaret, nextCaret)

    onChange(next)
  }

  return (
    <input
      className={className}
      type="text"
      inputMode="numeric"
      dir="ltr"
      value={formatAmountInput(value)}
      onChange={handleChange}
      placeholder={placeholder}
      disabled={disabled}
      required={required}
      autoFocus={autoFocus}
    />
  )
}
