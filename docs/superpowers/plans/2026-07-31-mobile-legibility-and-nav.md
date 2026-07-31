# Mobile Legibility & Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the app legible and navigable on a phone — bigger type, a delete-person affordance, a digits-only grouped amount input, and a back control that points the right way and matches the phone back button.

**Architecture:** Four independent slices sharing two new pure-function modules (`src/format/digits.ts`, an addition to `src/sync/snapshot-utils.ts`) and two new presentational components (`AmountField`, `BackButton`). Pure logic is extracted from components so it can be unit-tested without mounting routes. CSS work is purely mechanical token substitution.

**Tech Stack:** React 19, react-router 7, TypeScript, Vite 8, vitest 3 + @testing-library/react (jsdom).

**Spec:** [`docs/superpowers/specs/2026-07-31-mobile-legibility-and-nav-design.md`](../specs/2026-07-31-mobile-legibility-and-nav-design.md)

## Global Constraints

- All commands run from `apps/web/` unless stated otherwise.
- Test command: `npx vitest run`. Baseline before this plan: **4 files, 23 tests, all passing**.
- **No `@testing-library/jest-dom` matchers.** There is no vitest setup file, so matchers like `toBeInTheDocument()` are unavailable. Use plain vitest matchers (`toBeTruthy()`, `toBe()`), matching `src/components/ConfirmPress.test.tsx`.
- The app is RTL (`<html dir="rtl">`, `global.css:7` `direction: rtl`). **Never use a bidi-mirrored character for a directional icon** — `‹` (U+2039) and `›` (U+203A) both have `Bidi_Mirrored = Yes` and render flipped. Use SVG.
- Persian thousands separator is `٬` (U+066C ARABIC THOUSANDS SEPARATOR), not `,` and not `،`.
- `/\d/` in JavaScript matches **only** `[0-9]` — it does not match Persian `۰-۹`. Any digit test that runs over display text must use `/[0-9۰-۹٠-٩]/`.
- Copy is informal friend Persian, matching existing app voice.
- After Task 6, every `font-size` in `global.css` must reference a `var(--text-*)` token. Any CSS added in later tasks must use tokens.
- Commit after every task. Do not push — the user reviews and pushes.

---

### Task 1: Digit formatting helpers

**Files:**
- Create: `src/format/digits.ts`
- Create: `src/format/digits.test.ts`
- Modify: `src/dates/jalali.ts:36-38` (remove the private `toFaDigits`, import it instead)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `toFaDigits(value: number | string): string`
  - `toLatinDigits(value: string): string`
  - `canonicalAmount(raw: string): string` — digits only, leading zeros stripped, `''` stays `''`
  - `groupThousands(latinDigits: string): string` — Latin digits with `,` separators
  - `formatAmountInput(raw: string): string` — Persian digits grouped with `٬`
  - `parseAmountInput(raw: string): number` — `0` for empty

- [ ] **Step 1: Write the failing test**

Create `src/format/digits.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/format/digits.test.ts`
Expected: FAIL — `Failed to resolve import "./digits"`.

- [ ] **Step 3: Write the implementation**

Create `src/format/digits.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/format/digits.test.ts`
Expected: PASS — 17 tests.

- [ ] **Step 5: Remove the duplicate `toFaDigits` from `jalali.ts`**

`src/dates/jalali.ts` currently defines its own copy at lines 36-38:

```ts
function toFaDigits(n: number | string): string {
  return String(n).replace(/\d/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)]!)
}
```

Delete those three lines and add the import alongside the file's existing imports:

```ts
import { toFaDigits } from '../format/digits'
```

Leave every call site in `jalali.ts` unchanged — the signature is identical.

- [ ] **Step 6: Run the full suite to confirm no regression**

Run: `npx vitest run`
Expected: PASS — 5 files, 40 tests (23 baseline + 17 new). `src/dates/jalali.test.ts` still passes, proving the shared `toFaDigits` behaves identically.

- [ ] **Step 7: Commit**

```bash
git add src/format/digits.ts src/format/digits.test.ts src/dates/jalali.ts
git commit -m "feat(web): add shared digit and amount formatting helpers"
```

---

### Task 2: `AmountField` component

**Files:**
- Create: `src/components/AmountField.tsx`
- Create: `src/components/AmountField.test.tsx`

**Interfaces:**
- Consumes: `canonicalAmount`, `formatAmountInput`, `DIGIT_RE` from `src/format/digits.ts` (Task 1).
- Produces: `AmountField` component and `AmountFieldProps` type:

```ts
export type AmountFieldProps = {
  value: string                      // canonical Latin digits, e.g. "123456"
  onChange: (next: string) => void   // emits canonical Latin digits
  placeholder?: string
  disabled?: boolean
  required?: boolean
  autoFocus?: boolean
  className?: string
}
```

**Why the caret logic exists:** reformatting on every keystroke would otherwise push the caret to the end of the field, making it impossible to edit the middle of a number. The handler counts digits to the left of the caret, reformats, then places the caret after that same number of digits.

**Why the handler assigns `el.value` directly:** when a keystroke is rejected (a letter, or a `.`), the canonical value is unchanged, so React re-renders nothing and the stray character would remain visible in the DOM. Writing `el.value` synchronously keeps the DOM in sync regardless of whether a re-render happens.

- [ ] **Step 1: Write the failing test**

Create `src/components/AmountField.test.tsx`:

```tsx
import { useState } from 'react'
import { describe, expect, it, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { AmountField } from './AmountField'

function Harness({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial)
  return (
    <>
      <AmountField value={value} onChange={setValue} placeholder="مبلغ" />
      <output data-testid="canonical">{value}</output>
    </>
  )
}

function getInput(): HTMLInputElement {
  return screen.getByPlaceholderText('مبلغ') as HTMLInputElement
}

describe('AmountField', () => {
  afterEach(() => cleanup())

  it('uses a numeric keypad without a decimal key', () => {
    render(<Harness />)
    expect(getInput().getAttribute('inputMode')).toBe('numeric')
  })

  it('groups Persian digits as the value grows', () => {
    render(<Harness />)
    const input = getInput()
    fireEvent.change(input, { target: { value: '1234567' } })
    expect(input.value).toBe('۱٬۲۳۴٬۵۶۷')
    expect(screen.getByTestId('canonical').textContent).toBe('1234567')
  })

  it('rejects letters, punctuation, and a decimal separator', () => {
    render(<Harness initial="123" />)
    const input = getInput()
    fireEvent.change(input, { target: { value: '۱۲۳a' } })
    expect(input.value).toBe('۱۲۳')
    fireEvent.change(input, { target: { value: '۱۲۳.' } })
    expect(input.value).toBe('۱۲۳')
    expect(screen.getByTestId('canonical').textContent).toBe('123')
  })

  it('accepts Persian digits typed directly', () => {
    render(<Harness />)
    const input = getInput()
    fireEvent.change(input, { target: { value: '۴۵۶' } })
    expect(input.value).toBe('۴۵۶')
    expect(screen.getByTestId('canonical').textContent).toBe('456')
  })

  it('renders an existing value already grouped', () => {
    render(<Harness initial="1234567" />)
    expect(getInput().value).toBe('۱٬۲۳۴٬۵۶۷')
  })

  it('keeps the caret in place when inserting a digit mid-number', () => {
    render(<Harness initial="1234567" />)
    const input = getInput()
    // Display is '۱٬۲۳۴٬۵۶۷'. Insert '8' after '۱٬۲۳۴' (offset 5), so the
    // raw value carries 5 digits to the left of a caret at offset 6.
    fireEvent.change(input, {
      target: { value: '۱٬۲۳۴8٬۵۶۷', selectionStart: 6 },
    })
    // Canonical becomes '12348567' → display '۱۲٬۳۴۸٬۵۶۷'. The caret must
    // land just past the 5th digit, which is offset 6.
    expect(input.value).toBe('۱۲٬۳۴۸٬۵۶۷')
    expect(input.selectionStart).toBe(6)
  })

  it('strips leading zeros', () => {
    render(<Harness />)
    const input = getInput()
    fireEvent.change(input, { target: { value: '007' } })
    expect(input.value).toBe('۷')
    expect(screen.getByTestId('canonical').textContent).toBe('7')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/AmountField.test.tsx`
Expected: FAIL — `Failed to resolve import "./AmountField"`.

- [ ] **Step 3: Write the implementation**

Create `src/components/AmountField.tsx`:

```tsx
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/AmountField.test.tsx`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/AmountField.tsx src/components/AmountField.test.tsx
git commit -m "feat(web): add digits-only AmountField with Persian grouping"
```

---

### Task 3: Use `AmountField` at both amount entry points

**Files:**
- Modify: `src/routes/Person.tsx` (import; line 68 parse; lines 188-197 input)
- Modify: `src/components/TransactionForm.tsx` (import; line 41 initial value; line 52 parse; lines 95-105 input)

**Interfaces:**
- Consumes: `AmountField` (Task 2), `canonicalAmount` / `parseAmountInput` (Task 1).
- Produces: no new exports. `TransactionFormValues` is unchanged — `amount` stays a `number`.

- [ ] **Step 1: Update `Person.tsx` imports**

Add to the import block at the top of `src/routes/Person.tsx`:

```ts
import { AmountField } from '../components/AmountField'
import { parseAmountInput } from '../format/digits'
```

- [ ] **Step 2: Replace the parse in `Person.tsx`**

At line 68, replace:

```ts
    const parsedAmount = Number(amount.replace(/,/g, ''))
```

with:

```ts
    const parsedAmount = parseAmountInput(amount)
```

- [ ] **Step 3: Replace the amount input in `Person.tsx`**

At lines 188-197, replace:

```tsx
                <input
                  className="person-add-input"
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="مبلغ"
                  disabled={submitting}
                  required
                />
```

with:

```tsx
                <AmountField
                  className="person-add-input"
                  value={amount}
                  onChange={setAmount}
                  placeholder="مبلغ"
                  disabled={submitting}
                  required
                />
```

The `amount` state already initialises to `''` (line 24) and is reset to `''` on submit and cancel, so it is already the canonical form. No state changes needed.

- [ ] **Step 4: Update `TransactionForm.tsx` imports**

Add to the import block at the top of `src/components/TransactionForm.tsx`:

```ts
import { AmountField } from './AmountField'
import { canonicalAmount, parseAmountInput } from '../format/digits'
```

- [ ] **Step 5: Fix the initial value in `TransactionForm.tsx`**

At lines 41-43, replace:

```ts
  const [amount, setAmount] = useState(
    initialAmount !== undefined ? String(initialAmount) : '',
  )
```

with:

```ts
  const [amount, setAmount] = useState(
    initialAmount !== undefined ? canonicalAmount(String(initialAmount)) : '',
  )
```

Without this, editing an existing transaction seeds the field with a raw string that could carry a decimal point from legacy `REAL` data; `canonicalAmount` reduces it to the canonical digits the field expects.

- [ ] **Step 6: Replace the parse in `TransactionForm.tsx`**

At line 52, replace:

```ts
    const parsedAmount = Number(amount.replace(/,/g, ''))
```

with:

```ts
    const parsedAmount = parseAmountInput(amount)
```

- [ ] **Step 7: Replace the amount input in `TransactionForm.tsx`**

At lines 95-105, replace:

```tsx
      <input
        className="tx-form-input"
        type="text"
        inputMode="decimal"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="مبلغ"
        disabled={submitting}
        required
        autoFocus
      />
```

with:

```tsx
      <AmountField
        className="tx-form-input"
        value={amount}
        onChange={setAmount}
        placeholder="مبلغ"
        disabled={submitting}
        required
        autoFocus
      />
```

- [ ] **Step 8: Typecheck and run the full suite**

Run: `npx tsc -b && npx vitest run`
Expected: typecheck clean; PASS — 6 files, 47 tests.

- [ ] **Step 9: Commit**

```bash
git add src/routes/Person.tsx src/components/TransactionForm.tsx
git commit -m "feat(web): use AmountField for balance and transaction amounts"
```

---

### Task 4: `BackButton` component

**Files:**
- Create: `src/components/BackButton.tsx`
- Create: `src/components/BackButton.test.tsx`

**Interfaces:**
- Consumes: `useNavigate` from `react-router`.
- Produces: `BackButton` component and `BackButtonProps`:

```ts
export type BackButtonProps = {
  fallbackTo: string   // logical parent route, used when there is no in-app history
}
```

**Why SVG:** the current `›` character is bidi-mirrored in the RTL document and renders as `‹`. SVG path geometry is not mirrored, so the chevron points right deterministically.

**Why `navigate(-1)`:** the previous `<Link to="...">` *pushed* a history entry, so Home → Person → back left the stack `[Home, Person, Home]` and the phone back button then went to Person. Popping makes the in-app control and the phone button the same action.

**Why the fallback:** on a PWA cold start, a refresh, or a deep link, the current entry is the first in the session and `navigate(-1)` would leave the app. React Router tracks position as `idx` on `window.history.state`; `idx` of `0` or `undefined` means there is nothing to pop.

- [ ] **Step 1: Write the failing test**

Create `src/components/BackButton.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { BackButton } from './BackButton'

const { navigateMock } = vi.hoisted(() => ({ navigateMock: vi.fn() }))

vi.mock('react-router', () => ({
  useNavigate: () => navigateMock,
}))

describe('BackButton', () => {
  beforeEach(() => {
    navigateMock.mockReset()
  })
  afterEach(() => cleanup())

  it('pops history when there is an in-app entry to go back to', () => {
    window.history.pushState({ idx: 2 }, '', '/people/p1')
    render(<BackButton fallbackTo="/" />)
    fireEvent.click(screen.getByRole('button', { name: 'بازگشت' }))
    expect(navigateMock).toHaveBeenCalledWith(-1)
  })

  it('falls back to the parent route on a cold start (idx 0)', () => {
    window.history.replaceState({ idx: 0 }, '', '/people/p1')
    render(<BackButton fallbackTo="/people/p1" />)
    fireEvent.click(screen.getByRole('button', { name: 'بازگشت' }))
    expect(navigateMock).toHaveBeenCalledWith('/people/p1', { replace: true })
  })

  it('falls back to the parent route when history carries no idx', () => {
    window.history.replaceState(null, '', '/settings')
    render(<BackButton fallbackTo="/" />)
    fireEvent.click(screen.getByRole('button', { name: 'بازگشت' }))
    expect(navigateMock).toHaveBeenCalledWith('/', { replace: true })
  })

  it('renders an SVG chevron rather than a bidi-mirrored character', () => {
    window.history.replaceState({ idx: 1 }, '', '/')
    const { container } = render(<BackButton fallbackTo="/" />)
    const button = screen.getByRole('button', { name: 'بازگشت' })
    expect(container.querySelector('svg')).toBeTruthy()
    // The mirrored characters that caused the original bug must not appear.
    expect(button.textContent).toBe('')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/BackButton.test.tsx`
Expected: FAIL — `Failed to resolve import "./BackButton"`.

- [ ] **Step 3: Write the implementation**

Create `src/components/BackButton.tsx`:

```tsx
import { useNavigate } from 'react-router'

export type BackButtonProps = {
  fallbackTo: string
}

/**
 * Back control that performs the same action as the phone's back button.
 *
 * The chevron is an SVG on purpose: `›` (U+203A) is bidi-mirrored and renders
 * as `‹` inside this RTL document, which is what made the old character-based
 * chevron point the wrong way.
 */
export function BackButton({ fallbackTo }: BackButtonProps) {
  const navigate = useNavigate()

  function handleClick() {
    const idx = (window.history.state as { idx?: number } | null)?.idx
    if (typeof idx === 'number' && idx > 0) {
      navigate(-1)
    } else {
      navigate(fallbackTo, { replace: true })
    }
  }

  return (
    <button
      type="button"
      className="nav-back"
      onClick={handleClick}
      aria-label="بازگشت"
    >
      <svg
        viewBox="0 0 24 24"
        width="22"
        height="22"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d="M9 5l7 7-7 7"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  )
}
```

The path runs (9,5) → (16,12) → (9,19): a chevron pointing right.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/BackButton.test.tsx`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/BackButton.tsx src/components/BackButton.test.tsx
git commit -m "fix(web): add SVG BackButton that pops history like the phone back button"
```

---

### Task 5: Use `BackButton` at all four sites, restyle `.nav-back`

**Files:**
- Modify: `src/routes/Person.tsx:145-147`
- Modify: `src/routes/Settings.tsx:133-135`
- Modify: `src/routes/Settled.tsx:67-69`
- Modify: `src/routes/Balance.tsx:234-240`
- Modify: `src/styles/global.css:296-303` (`.nav-back`)

**Interfaces:**
- Consumes: `BackButton` (Task 4).
- Produces: `.nav-back` becomes a 44×44 button rule with no `font-size` — Task 6 depends on that `font-size` being gone.

- [ ] **Step 1: Replace the back link in `Person.tsx`**

Add the import:

```ts
import { BackButton } from '../components/BackButton'
```

At lines 145-147, replace:

```tsx
        <Link to="/" className="nav-back" aria-label="بازگشت">
          ›
        </Link>
```

with:

```tsx
        <BackButton fallbackTo="/" />
```

`Link` is still used later in this file (line 243, `person-settled`), so keep the `Link` import.

- [ ] **Step 2: Replace the back link in `Settings.tsx`**

Add the import:

```ts
import { BackButton } from '../components/BackButton'
```

At lines 133-135, replace:

```tsx
        <Link to="/" className="nav-back" aria-label="بازگشت">
          ›
        </Link>
```

with:

```tsx
        <BackButton fallbackTo="/" />
```

Then check whether `Link` is still referenced in `Settings.tsx` (`grep -n '<Link' src/routes/Settings.tsx`). If it is not, remove `Link` from the `react-router` import to keep the typecheck clean.

- [ ] **Step 3: Replace the back link in `Settled.tsx`**

Add the import:

```ts
import { BackButton } from '../components/BackButton'
```

At lines 67-69, replace:

```tsx
        <Link to={`/people/${id}`} className="nav-back" aria-label="بازگشت">
          ›
        </Link>
```

with:

```tsx
        <BackButton fallbackTo={`/people/${id}`} />
```

Then check whether `Link` is still referenced (`grep -n '<Link' src/routes/Settled.tsx`) and drop the unused import if not.

- [ ] **Step 4: Replace the back link in `Balance.tsx`**

Add the import:

```ts
import { BackButton } from '../components/BackButton'
```

At lines 234-240, replace:

```tsx
        <Link
          to={detail ? `/people/${detail.personId}` : '/'}
          className="nav-back"
          aria-label="بازگشت"
        >
          ›
        </Link>
```

with:

```tsx
        <BackButton fallbackTo={detail ? `/people/${detail.personId}` : '/'} />
```

Then check whether `Link` is still referenced (`grep -n '<Link' src/routes/Balance.tsx`) and drop the unused import if not.

- [ ] **Step 5: Restyle `.nav-back`**

In `src/styles/global.css` at lines 296-303, replace:

```css
.nav-back {
  color: var(--ink);
  text-decoration: none;
  font-size: 1.5rem;
  font-weight: 700;
  line-height: 1;
  text-align: center;
}
```

with:

```css
.nav-back {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  min-height: 44px;
  margin: 0;
  padding: 0;
  background: none;
  border: 0;
  color: var(--ink);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
```

`font-size` and `font-weight` are gone because the chevron is an explicitly sized SVG. `background`/`border`/`padding` are reset because the element is now a `<button>` rather than an `<a>`. The 44×44 minimum is the comfortable touch-target floor.

- [ ] **Step 6: Confirm no bidi-mirrored chevrons remain**

Run: `grep -rn '›\|‹' src/routes src/components`
Expected: no matches in the four route headers. (`JalaliDateField` may legitimately use `‹ ›` for month navigation — leave those alone; they are a matched pair whose visual direction is symmetric in context and out of scope.)

- [ ] **Step 7: Typecheck and run the full suite**

Run: `npx tsc -b && npx vitest run`
Expected: typecheck clean (no unused-import errors); PASS — 7 files, 51 tests.

- [ ] **Step 8: Commit**

```bash
git add src/routes/Person.tsx src/routes/Settings.tsx src/routes/Settled.tsx src/routes/Balance.tsx src/styles/global.css
git commit -m "fix(web): point back chevron right and match phone back behavior"
```

---

### Task 6: Raise the type scale and route every size through tokens

**Files:**
- Modify: `src/styles/tokens.css:8-13`
- Modify: `src/styles/global.css` (30 hardcoded `font-size` values → 29 substitutions + 1 already removed in Task 5)

**Interfaces:**
- Consumes: `.nav-back`'s `font-size` having been removed in Task 5.
- Produces: an invariant later tasks must preserve — every `font-size` in `global.css` references a `var(--text-*)` token.

- [ ] **Step 1: Record the baseline**

Run:

```bash
grep -c 'font-size:' src/styles/global.css
grep -c 'font-size:\s*[0-9]' src/styles/global.css
```

Expected: `48` total declarations, `29` still hardcoded (30 minus the `.nav-back` one deleted in Task 5). If the second number is not 29, stop and reconcile against §4.2 of the spec before continuing.

- [ ] **Step 2: Raise the token values**

In `src/styles/tokens.css`, replace lines 8-13:

```css
  --text-amount: 3.25rem;
  --text-name: 1.2rem;
  --text-title: 1.125rem;
  --text-action: 0.9375rem;
  --text-status: 0.8125rem;
  --text-meta: 0.75rem;
```

with:

```css
  --text-amount: 3.25rem; /* 52px — large amount readout */
  --text-name: 1.375rem; /* 22px — person and balance names */
  --text-title: 1.25rem; /* 20px — titles, and the gear glyph */
  --text-action: 1rem; /* 16px — buttons, links, inputs; ≥16px avoids iOS focus zoom */
  --text-status: 0.9375rem; /* 15px — status lines, body text */
  --text-meta: 0.875rem; /* 14px — captions, footers, badges */
```

No new token is added: the only `1.5rem` belonged to `.nav-back`, whose declaration Task 5 removed.

- [ ] **Step 3: Substitute every hardcoded size**

Run this from `apps/web`:

```bash
sed -i \
  -e 's/font-size: 0\.625rem;/font-size: var(--text-meta);/g' \
  -e 's/font-size: 0\.6875rem;/font-size: var(--text-meta);/g' \
  -e 's/font-size: 0\.75rem;/font-size: var(--text-meta);/g' \
  -e 's/font-size: 0\.875rem;/font-size: var(--text-meta);/g' \
  -e 's/font-size: 0\.8125rem !important;/font-size: var(--text-status) !important;/g' \
  -e 's/font-size: 0\.8125rem;/font-size: var(--text-status);/g' \
  -e 's/font-size: 1\.125rem;/font-size: var(--text-title);/g' \
  -e 's/font-size: 1\.25rem;/font-size: var(--text-title);/g' \
  src/styles/global.css
```

Each pattern is anchored on `font-size: ` so `padding`, `gap`, and other properties using the same lengths are untouched. The `!important` variant is listed before the plain one; because the plain pattern requires `rem;` immediately, the two cannot collide, and `.auth-error` keeps its `!important`.

- [ ] **Step 4: Verify the invariant**

Run:

```bash
grep -c 'font-size:\s*[0-9]' src/styles/global.css
grep -c 'font-size: var(--text-' src/styles/global.css
```

Expected: `0` hardcoded, `48` token-based. If the first command prints `0`, `grep -c` exits non-zero — that is expected, not a failure.

- [ ] **Step 5: Confirm the input floor**

Run: `grep -n -A6 '\.person-add-input\|\.tx-form-input' src/styles/global.css | grep 'font-size'`
Expected: each resolves to `var(--text-action)` (16px) or larger. If either resolves to `var(--text-meta)` or `var(--text-status)`, change that declaration to `var(--text-action)` so form fields do not trigger iOS focus zoom.

- [ ] **Step 6: Run the full suite**

Run: `npx vitest run`
Expected: PASS — 7 files, 51 tests. (CSS is untested by unit tests; this confirms nothing else broke.)

- [ ] **Step 7: Commit**

```bash
git add src/styles/tokens.css src/styles/global.css
git commit -m "fix(web): raise type scale and route all font sizes through tokens"
```

---

### Task 7: `removePersonFromSnapshot` helper

**Files:**
- Modify: `src/sync/snapshot-utils.ts` (append the new function)
- Create: `src/sync/snapshot-utils.test.ts`

**Interfaces:**
- Consumes: the `Snapshot` type from `src/sync/cache.ts`.
- Produces:

```ts
export function removePersonFromSnapshot(
  snapshot: Snapshot,
  personId: string,
): Pick<Snapshot, 'people' | 'balances' | 'transactions'>
```

**Why a pure helper:** deleting a person cascades on the server (`ON DELETE CASCADE`), so the offline cache must prune the same three collections or it would keep orphaned balances and transactions. Extracting it keeps the rule unit-testable without mounting the route.

- [ ] **Step 1: Write the failing test**

Create `src/sync/snapshot-utils.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { removePersonFromSnapshot } from './snapshot-utils'
import type { Snapshot } from './cache'

const snapshot: Snapshot = {
  people: [
    { id: 'p1', name: 'الف', note: null, createdAt: 'x', updatedAt: 'x' },
    { id: 'p2', name: 'ب', note: null, createdAt: 'x', updatedAt: 'x' },
  ],
  balances: [
    { id: 'b1', personId: 'p1', label: 'تومان', createdAt: 'x', updatedAt: 'x' },
    { id: 'b2', personId: 'p1', label: 'دلار', createdAt: 'x', updatedAt: 'x' },
    { id: 'b3', personId: 'p2', label: 'تومان', createdAt: 'x', updatedAt: 'x' },
  ],
  transactions: [
    { id: 't1', balanceId: 'b1', type: 'deposit', amount: 10, date: 'd', note: null, createdAt: 'x', updatedAt: 'x' },
    { id: 't2', balanceId: 'b2', type: 'deposit', amount: 20, date: 'd', note: null, createdAt: 'x', updatedAt: 'x' },
    { id: 't3', balanceId: 'b3', type: 'deposit', amount: 30, date: 'd', note: null, createdAt: 'x', updatedAt: 'x' },
  ],
  updatedAt: 'x',
}

describe('removePersonFromSnapshot', () => {
  it('removes the person', () => {
    const next = removePersonFromSnapshot(snapshot, 'p1')
    expect(next.people.map((p) => p.id)).toEqual(['p2'])
  })

  it('removes that person’s balances', () => {
    const next = removePersonFromSnapshot(snapshot, 'p1')
    expect(next.balances.map((b) => b.id)).toEqual(['b3'])
  })

  it('removes transactions belonging to the removed balances', () => {
    const next = removePersonFromSnapshot(snapshot, 'p1')
    expect(next.transactions.map((t) => t.id)).toEqual(['t3'])
  })

  it('leaves other people untouched', () => {
    const next = removePersonFromSnapshot(snapshot, 'p1')
    expect(next.people).toHaveLength(1)
    expect(next.balances).toHaveLength(1)
    expect(next.transactions).toHaveLength(1)
  })

  it('is a no-op for an unknown person', () => {
    const next = removePersonFromSnapshot(snapshot, 'nope')
    expect(next.people).toHaveLength(2)
    expect(next.balances).toHaveLength(3)
    expect(next.transactions).toHaveLength(3)
  })

  it('does not mutate the input snapshot', () => {
    removePersonFromSnapshot(snapshot, 'p1')
    expect(snapshot.people).toHaveLength(2)
    expect(snapshot.balances).toHaveLength(3)
    expect(snapshot.transactions).toHaveLength(3)
  })
})
```

If the literal above does not typecheck, run `grep -n 'export type Snapshot' -A12 src/sync/cache.ts` and align the fixture fields with the real `Person`, `Balance`, and `Transaction` shapes from `@pat/domain`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/sync/snapshot-utils.test.ts`
Expected: FAIL — `removePersonFromSnapshot is not a function`.

- [ ] **Step 3: Write the implementation**

Append to `src/sync/snapshot-utils.ts`:

```ts
/**
 * Prunes a person and everything beneath them from a cached snapshot,
 * mirroring the server's `ON DELETE CASCADE` from people → balances →
 * transactions. Returns new arrays; the input is not mutated.
 */
export function removePersonFromSnapshot(
  snapshot: Snapshot,
  personId: string,
): Pick<Snapshot, 'people' | 'balances' | 'transactions'> {
  const removedBalanceIds = new Set(
    snapshot.balances.filter((b) => b.personId === personId).map((b) => b.id),
  )
  return {
    people: snapshot.people.filter((p) => p.id !== personId),
    balances: snapshot.balances.filter((b) => b.personId !== personId),
    transactions: snapshot.transactions.filter(
      (t) => !removedBalanceIds.has(t.balanceId),
    ),
  }
}
```

`Snapshot` is already imported at the top of `snapshot-utils.ts`; if it is not, add it from `./cache`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/sync/snapshot-utils.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/sync/snapshot-utils.ts src/sync/snapshot-utils.test.ts
git commit -m "feat(web): add removePersonFromSnapshot cascade helper"
```

---

### Task 8: Delete-person affordance

**Files:**
- Modify: `src/routes/Person.tsx` (imports, state, handler, footer UI)
- Modify: `src/styles/global.css` (two new rules)

**Interfaces:**
- Consumes: `removePersonFromSnapshot` (Task 7), `ConfirmPress` (`src/components/ConfirmPress.tsx`), `settledBalancesForPerson` (`src/sync/snapshot-utils.ts:100`), `useSync().mutate` / `.online`.
- Produces: no new exports.

**Rule:** delete is offered only when `activeCount === 0`. `activeCount` is `balances.length` in this component, since `balances` already holds only active balances (`activeBalancesForPerson`).

- [ ] **Step 1: Add imports and state to `Person.tsx`**

Add to the imports:

```ts
import { useNavigate } from 'react-router'
import { ConfirmPress } from '../components/ConfirmPress'
```

Extend the existing `snapshot-utils` import to include `settledBalancesForPerson` and `removePersonFromSnapshot`:

```ts
import {
  activeBalancesForPerson,
  personFromSnapshot,
  removePersonFromSnapshot,
  settledBalancesForPerson,
  type BalanceListItem,
} from '../sync/snapshot-utils'
```

Add two state values next to the existing ones (after line 27):

```ts
  const [settledCount, setSettledCount] = useState(0)
  const [deleting, setDeleting] = useState(false)
```

And the navigate hook next to the existing `useSync()` call:

```ts
  const navigate = useNavigate()
```

- [ ] **Step 2: Track the settled count in `loadPerson`**

Inside `loadPerson`, in the early-return branch where there is no snapshot, add:

```ts
      setSettledCount(0)
```

and after the existing `setBalances(activeBalancesForPerson(snapshot, id))`, add:

```ts
    setSettledCount(settledBalancesForPerson(snapshot, id).length)
```

- [ ] **Step 3: Add the delete handler**

Add after `handleAddBalance`:

```ts
  async function handleDeletePerson() {
    if (!id) return
    setError(null)
    setDeleting(true)

    try {
      await mutate({ method: 'DELETE', path: `/people/${id}` })

      if (!online) {
        const snapshot = await getSnapshot()
        if (snapshot) {
          await setSnapshot({
            ...removePersonFromSnapshot(snapshot, id),
            updatedAt: new Date().toISOString(),
          })
        }
      }

      navigate('/', { replace: true })
    } catch {
      setError('حذف شخص نشد.')
      setDeleting(false)
    }
  }
```

`replace: true` keeps the deleted person's URL out of the forward history, so the new `BackButton` cannot land on a person that no longer exists.

- [ ] **Step 4: Add the footer UI**

In `Person.tsx`, immediately after the `person-settled` link (line 243-245):

```tsx
            <Link to={`/people/${id}/settled`} className="person-settled">
              تسویه‌شده‌ها
            </Link>
```

add:

```tsx
            {balances.length > 0 ? (
              <p className="person-delete-hint">
                برای حذف، اول موجودی‌ها را تسویه کن
              </p>
            ) : (
              <ConfirmPress
                label="حذف شخص"
                confirmLabel={
                  settledCount > 0
                    ? `${settledCount.toLocaleString('fa-IR')} موجودی تسویه‌شده حذف شود؟`
                    : 'مطمئنی؟ دوباره بزن'
                }
                onConfirm={handleDeletePerson}
                disabled={deleting}
                className="person-delete"
              />
            )}
```

- [ ] **Step 5: Add the styles**

Append to `src/styles/global.css`:

```css
.person-delete-hint {
  margin: 1.25rem 0 0;
  color: var(--muted);
  font-size: var(--text-meta);
  text-align: center;
}

.person-delete {
  margin: 1.25rem 0 0;
  padding: 0.5rem 0;
  min-height: 44px;
  background: none;
  border: 0;
  border-top: 1px solid var(--rule);
  color: var(--danger);
  font-size: var(--text-action);
  font-family: inherit;
  cursor: pointer;
  width: 100%;
}
```

Both rules use tokens, preserving the Task 6 invariant. `ConfirmPress` already applies `confirm-press--armed` when armed, so no extra armed styling is required here.

- [ ] **Step 6: Verify the type-scale invariant still holds**

Run: `grep -c 'font-size:\s*[0-9]' src/styles/global.css`
Expected: `0`.

- [ ] **Step 7: Write the failing component test**

Create `src/routes/Person.delete.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'

const { mutateMock, navigateMock, getSnapshotMock, setSnapshotMock } = vi.hoisted(
  () => ({
    mutateMock: vi.fn(),
    navigateMock: vi.fn(),
    getSnapshotMock: vi.fn(),
    setSnapshotMock: vi.fn(),
  }),
)

vi.mock('react-router', () => ({
  useParams: () => ({ id: 'p1' }),
  useNavigate: () => navigateMock,
  Link: ({ children }: { children?: React.ReactNode }) => <a>{children}</a>,
}))

vi.mock('../sync/SyncContext', () => ({
  useSync: () => ({
    online: true,
    pendingCount: 0,
    lastSyncedAt: null,
    refresh: vi.fn().mockResolvedValue(undefined),
    mutate: mutateMock,
    clearOutbox: vi.fn(),
  }),
}))

vi.mock('../sync/cache', () => ({
  getSnapshot: getSnapshotMock,
  setSnapshot: setSnapshotMock,
}))

import { Person } from './Person'

function snapshotWith(activeAmount: number | null) {
  return {
    people: [
      { id: 'p1', name: 'الف', note: null, createdAt: 'x', updatedAt: 'x' },
    ],
    balances: [
      { id: 'b1', personId: 'p1', label: 'تومان', createdAt: 'x', updatedAt: 'x' },
    ],
    transactions:
      activeAmount === null
        ? []
        : [
            {
              id: 't1',
              balanceId: 'b1',
              type: 'deposit' as const,
              amount: activeAmount,
              date: 'd',
              note: null,
              createdAt: 'x',
              updatedAt: 'x',
            },
            ...(activeAmount === 0
              ? [
                  {
                    id: 't2',
                    balanceId: 'b1',
                    type: 'return' as const,
                    amount: 0,
                    date: 'd',
                    note: null,
                    createdAt: 'x',
                    updatedAt: 'x',
                  },
                ]
              : []),
          ],
    updatedAt: 'x',
  }
}

describe('Person delete', () => {
  beforeEach(() => {
    mutateMock.mockReset().mockResolvedValue(undefined)
    navigateMock.mockReset()
    setSnapshotMock.mockReset().mockResolvedValue(undefined)
    getSnapshotMock.mockReset()
  })
  afterEach(() => cleanup())

  it('hides delete and shows a hint while a balance is active', async () => {
    getSnapshotMock.mockResolvedValue(snapshotWith(100))
    render(<Person />)
    await waitFor(() => {
      expect(screen.getByText('برای حذف، اول موجودی‌ها را تسویه کن')).toBeTruthy()
    })
    expect(screen.queryByRole('button', { name: 'حذف شخص' })).toBe(null)
  })

  it('offers delete when nothing is active, and needs two taps', async () => {
    // A deposit fully returned leaves the balance settled, so activeCount is 0.
    const settled = snapshotWith(50)
    settled.transactions.push({
      id: 't2',
      balanceId: 'b1',
      type: 'return' as const,
      amount: 50,
      date: 'd',
      note: null,
      createdAt: 'x',
      updatedAt: 'x',
    })
    getSnapshotMock.mockResolvedValue(settled)
    render(<Person />)

    const btn = await waitFor(() =>
      screen.getByRole('button', { name: 'حذف شخص' }),
    )
    fireEvent.click(btn)
    expect(mutateMock).not.toHaveBeenCalled()

    // Armed label reports the settled-balance count.
    fireEvent.click(
      screen.getByRole('button', { name: '۱ موجودی تسویه‌شده حذف شود؟' }),
    )
    await waitFor(() => {
      expect(mutateMock).toHaveBeenCalledWith({
        method: 'DELETE',
        path: '/people/p1',
      })
    })
    expect(navigateMock).toHaveBeenCalledWith('/', { replace: true })
  })
})
```

- [ ] **Step 8: Run the test**

Run: `npx vitest run src/routes/Person.delete.test.tsx`
Expected: PASS — 2 tests.

If a test fails because `Person.tsx` renders `SyncBanner` or `JalaliDateField` in a way the mocks do not satisfy, add the minimal extra mock rather than loosening the assertions. If the settled-vs-active fixture does not produce the expected `activeCount`, check `isBalanceActive` / `balanceQuantity` in `@pat/domain` and adjust the transaction amounts so the balance nets to zero.

- [ ] **Step 9: Run the full suite and typecheck**

Run: `npx tsc -b && npx vitest run`
Expected: typecheck clean; PASS — 9 files, 59 tests.

- [ ] **Step 10: Commit**

```bash
git add src/routes/Person.tsx src/routes/Person.delete.test.tsx src/styles/global.css
git commit -m "feat(web): allow deleting a person with no active balances"
```

---

### Task 9: Screenshot QA

**Files:**
- No source changes expected. Fix-ups go in a follow-up commit if QA finds problems.

**Interfaces:**
- Consumes: everything from Tasks 1-8.
- Produces: visual confirmation, plus a note in the plan of anything deferred.

- [ ] **Step 1: Start the dev servers**

From the repo root: `npm run dev`

Wait for `API is ready` and `Web is ready`. The app serves at `http://127.0.0.1:5173`.

- [ ] **Step 2: Seed enough data to exercise every screen**

Through the UI, create:
- a person with **one active balance** (a deposit, no return) — exercises the blocked-delete hint,
- a person with **one fully settled balance** (deposit then equal return) — exercises the offered delete,
- a person with **no balances** — exercises delete with no settled history.

While entering amounts, confirm digits group live as `۱٬۲۳۴٬۵۶۷` and that letters and `.` are refused.

- [ ] **Step 3: Capture a phone viewport on each screen**

Emulate a phone (≈390×844) and screenshot: Home, Person (active), Person (settled), Balance detail, Settled list, Settings.

Use the Chrome DevTools MCP tools: `resize_page` to 390×844, `navigate_page`, then `take_screenshot`.

- [ ] **Step 4: Check each item against the spec**

- Body text is comfortably readable; nothing looks 10-12px anymore.
- Tapping a form field does **not** zoom the page (inputs ≥16px).
- The back chevron points **right** on every screen that has one.
- The back control is an easy tap target (44×44).
- Amounts display grouped with `٬`.
- Person with an active balance shows the hint and **no** delete button.
- Person with no active balances shows `حذف شخص`; first tap arms it, second deletes and returns Home.

- [ ] **Step 5: Verify the back button matches history**

Navigate Home → Person → Balance. Press the **browser/phone back** button twice: it must retrace Balance → Person → Home. Then repeat using the **in-app chevron** twice and confirm it lands on the same screens in the same order. Previously the in-app control pushed a duplicate Home entry, so the two diverged.

- [ ] **Step 6: Confirm the delete cascade actually persisted**

After deleting a person, reload the page. The person must stay gone, and the Home count must reflect it — proving the server delete ran rather than only the local snapshot changing.

- [ ] **Step 7: Final verification**

From `apps/web`:

```bash
npx tsc -b
npx vitest run
grep -c 'font-size:\s*[0-9]' src/styles/global.css
```

Expected: typecheck clean; 9 files / 59 tests passing; `0` hardcoded font sizes.

From the repo root:

```bash
npm run test:all
```

Expected: the `@pat/domain` and `@pat/api` suites still pass — neither was touched, so any failure means an unintended change.

- [ ] **Step 8: Commit any QA fixes**

Only if Step 4-6 turned up problems:

```bash
git add -A
git commit -m "fix(web): address mobile QA findings"
```

Then report results to the user for review and push. Do **not** push.

---

## Self-Review

**Spec coverage**

| Spec section | Task |
|---|---|
| §4.1 token values | 6 |
| §4.2 hardcoded mapping, `!important`, `.home-gear`, `.nav-back` removal | 5 (nav-back), 6 (rest) |
| §4.3 acceptance (grep → 0, ≥16px inputs) | 6 steps 4-5, 9 step 7 |
| §5.1 delete rule + settled count | 8 |
| §5.2 UI, blocked hint, armed labels | 8 step 4 |
| §5.3 data flow, offline pruning, `replace: true` | 7 (helper), 8 step 3 |
| §6.1 `digits.ts` + `jalali.ts` dedupe | 1 |
| §6.2 `AmountField`, caret preservation | 2 |
| §6.3 call sites incl. `TransactionForm` initial value | 3 |
| §7.1 SVG chevron, `navigate(-1)`, idx fallback, `<button>` | 4 |
| §7.2 four call sites | 5 |
| §7.3 `.nav-back` styling, 44×44 | 5 step 5 |
| §8.1 digits tests | 1 |
| §8.2 AmountField tests | 2 |
| §8.3 BackButton tests | 4 |
| §8.4 delete tests | 7, 8 |
| §8.5 grep + screenshot QA | 6, 9 |

No gaps.

**Type consistency**

`canonicalAmount` / `formatAmountInput` / `parseAmountInput` / `DIGIT_RE` are defined in Task 1 and used with those exact names in Tasks 2 and 3. `AmountFieldProps.value` is a canonical Latin digit `string` in both the definition (Task 2) and every call site (Task 3). `BackButtonProps.fallbackTo` is a `string` in Task 4 and all four Task 5 call sites. `removePersonFromSnapshot` returns `Pick<Snapshot, 'people' | 'balances' | 'transactions'>` in Task 7 and is spread with `updatedAt` in Task 8, which reconstitutes a full `Snapshot`.

**Ordering dependency worth restating:** Task 5 must land before Task 6, because Task 6's `grep → 0` acceptance assumes `.nav-back`'s `font-size: 1.5rem` is already gone. Task 8 adds CSS and so must keep Task 6's token invariant, which its Step 6 re-checks.
