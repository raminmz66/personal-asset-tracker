# Form Controls Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace typed Jalali dates, `window.confirm`, and native radios with custom notebook-styled calendar, two-tap confirm, and segmented control.

**Architecture:** Extend `jalali.ts` with calendar-grid helpers; rebuild `JalaliDateField` as a popover picker; add `SegmentedControl` and `ConfirmPress`; wire into TransactionForm, Person, Balance, and Settings. No new dependencies.

**Tech Stack:** React 19, Vitest, dayjs + jalaliday, existing CSS tokens in `apps/web`.

## Global Constraints

- No new datepicker libraries — use `dayjs` + `jalaliday` only
- Jalali UI only; storage stays Gregorian `YYYY-MM-DD`
- No `window.confirm` for delete or import after this work
- No native radios for transaction type
- Informal friend Persian copy; notebook visual tokens (`--accent` `#0F6B6B`, `--danger`, etc.)
- ConfirmPress default arm timeout: 3000ms
- Date field: no free typing

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/web/src/dates/jalali.ts` | Add month-grid / shift / parse helpers |
| `apps/web/src/dates/jalali.test.ts` | Tests for new helpers |
| `apps/web/src/components/JalaliDateField.tsx` | Calendar popover date field |
| `apps/web/src/components/SegmentedControl.tsx` | Two-option segment control |
| `apps/web/src/components/ConfirmPress.tsx` | Two-tap destructive confirm |
| `apps/web/src/components/ConfirmPress.test.tsx` | Arm / confirm / timeout tests |
| `apps/web/src/components/TransactionForm.tsx` | Use SegmentedControl + JalaliDateField |
| `apps/web/src/routes/Person.tsx` | Use JalaliDateField |
| `apps/web/src/routes/Balance.tsx` | Use ConfirmPress for delete |
| `apps/web/src/routes/Settings.tsx` | Use ConfirmPress for import; drop confirm |
| `apps/web/src/styles/global.css` | Styles for calendar, segment, confirm-press |

---

### Task 1: Jalali calendar helpers

**Files:**
- Modify: `apps/web/src/dates/jalali.ts`
- Modify: `apps/web/src/dates/jalali.test.ts`

**Interfaces:**
- Consumes: existing `dayjs` + `jalaliday` setup in `jalali.ts`
- Produces:
  - `export type JalaliCell = { jalali: string; day: number; inMonth: boolean }`
  - `export function parseJalaliParts(jalali: string): { year: number; month: number; day: number } | null`
  - `export function formatJalaliParts(year: number, month: number, day: number): string`
  - `export function shiftJalaliMonth(jalali: string, delta: number): string` — returns `YYYY/MM/01` of shifted month (fallback امروز if invalid input)
  - `export function jalaliMonthLabel(jalali: string): string` — e.g. `مرداد ۱۴۰۴`
  - `export function buildJalaliMonthGrid(jalali: string): JalaliCell[]` — 35 or 42 cells, week starts Saturday (Jalali)

- [ ] **Step 1: Write the failing tests**

Add to `apps/web/src/dates/jalali.test.ts`:

```ts
import {
  // ...existing
  parseJalaliParts,
  formatJalaliParts,
  shiftJalaliMonth,
  jalaliMonthLabel,
  buildJalaliMonthGrid,
} from './jalali'

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
    expect(cells.some((c) => c.jalali === '1404/05/01' && c.inMonth)).toBe(true)
    expect(cells.some((c) => c.jalali === '1404/05/31' && c.inMonth)).toBe(true)
  })

  it('pads to a multiple of 7', () => {
    const cells = buildJalaliMonthGrid('1404/05/10')
    expect(cells.length % 7).toBe(0)
    expect(cells.length).toBeGreaterThanOrEqual(28)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w @pat/web -- src/dates/jalali.test.ts`

Expected: FAIL — helpers not exported / not defined

- [ ] **Step 3: Implement helpers in `jalali.ts`**

```ts
export type JalaliCell = {
  jalali: string
  day: number
  inMonth: boolean
}

export function parseJalaliParts(
  jalali: string,
): { year: number; month: number; day: number } | null {
  const trimmed = jalali.trim()
  const m = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(trimmed)
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return { year, month, day }
}

export function formatJalaliParts(
  year: number,
  month: number,
  day: number,
): string {
  return `${year}/${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}`
}

function toFaDigits(n: number | string): string {
  return String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]!)
}

export function shiftJalaliMonth(jalali: string, delta: number): string {
  const parts = parseJalaliParts(jalali) ?? parseJalaliParts(todayJalali())!
  const base = dayjs(
    formatJalaliParts(parts.year, parts.month, 1),
    { jalali: true } as dayjs.OptionType,
  ).calendar('jalali')
  const shifted = base.add(delta, 'month')
  return formatJalaliParts(shifted.year(), shifted.month() + 1, 1)
}

export function jalaliMonthLabel(jalali: string): string {
  const parts = parseJalaliParts(jalali) ?? parseJalaliParts(todayJalali())!
  const month = JALALI_MONTHS[parts.month - 1]!
  return `${month} ${toFaDigits(parts.year)}`
}

export function buildJalaliMonthGrid(jalali: string): JalaliCell[] {
  const parts = parseJalaliParts(jalali) ?? parseJalaliParts(todayJalali())!
  const first = dayjs(
    formatJalaliParts(parts.year, parts.month, 1),
    { jalali: true } as dayjs.OptionType,
  ).calendar('jalali')
  const daysInMonth = first.daysInMonth()
  // dayjs: 0=Sunday … 6=Saturday. Jalali week starts Saturday.
  const firstWeekday = first.day() // 0 Sun .. 6 Sat
  const leading = (firstWeekday + 1) % 7 // Sat=0, Sun=1, … Fri=6

  const cells: JalaliCell[] = []

  const prev = first.subtract(1, 'month')
  const prevDays = prev.daysInMonth()
  for (let i = leading - 1; i >= 0; i--) {
    const day = prevDays - i
    cells.push({
      jalali: formatJalaliParts(prev.year(), prev.month() + 1, day),
      day,
      inMonth: false,
    })
  }

  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({
      jalali: formatJalaliParts(parts.year, parts.month, day),
      day,
      inMonth: true,
    })
  }

  let nextDay = 1
  const next = first.add(1, 'month')
  while (cells.length % 7 !== 0) {
    cells.push({
      jalali: formatJalaliParts(next.year(), next.month() + 1, nextDay),
      day: nextDay,
      inMonth: false,
    })
    nextDay++
  }

  return cells
}
```

Verify `jalaliday` `daysInMonth` / `add` behave under `.calendar('jalali')`. If weekday padding is wrong for 1404/05, adjust `leading` formula until tests pass and the 1st lands on the correct weekday column.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -w @pat/web -- src/dates/jalali.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/dates/jalali.ts apps/web/src/dates/jalali.test.ts
git commit -m "$(cat <<'EOF'
feat(web): add Jalali month-grid helpers for date picker

EOF
)"
```

---

### Task 2: `ConfirmPress` component

**Files:**
- Create: `apps/web/src/components/ConfirmPress.tsx`
- Create: `apps/web/src/components/ConfirmPress.test.tsx`
- Modify: `apps/web/src/styles/global.css` (idle/armed styles; can finish styling in Task 5 if preferred — minimum classes here)

**Interfaces:**
- Consumes: none from Task 1
- Produces:
```ts
export type ConfirmPressProps = {
  label: string
  confirmLabel: string
  onConfirm: () => void
  disabled?: boolean
  className?: string
  armTimeoutMs?: number // default 3000
}
export function ConfirmPress(props: ConfirmPressProps): JSX.Element
```

- [ ] **Step 1: Ensure React Testing Library is available**

Check `apps/web/package.json`. If `@testing-library/react` / `@testing-library/user-event` / `jsdom` are missing, add them as devDependencies of `@pat/web` and ensure Vitest uses a jsdom environment (e.g. `apps/web/vitest.config.ts` with `environment: 'jsdom'`). Prefer matching versions already used elsewhere in the monorepo if present.

- [ ] **Step 2: Write the failing tests**

```tsx
// apps/web/src/components/ConfirmPress.test.tsx
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { ConfirmPress } from './ConfirmPress'

describe('ConfirmPress', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('calls onConfirm only on the second click', () => {
    const onConfirm = vi.fn()
    render(
      <ConfirmPress
        label="حذف تراکنش"
        confirmLabel="مطمئنی؟ دوباره بزن"
        onConfirm={onConfirm}
      />,
    )
    const btn = screen.getByRole('button', { name: 'حذف تراکنش' })
    fireEvent.click(btn)
    expect(onConfirm).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'مطمئنی؟ دوباره بزن' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('disarms after timeout', () => {
    const onConfirm = vi.fn()
    render(
      <ConfirmPress
        label="حذف تراکنش"
        confirmLabel="مطمئنی؟ دوباره بزن"
        onConfirm={onConfirm}
        armTimeoutMs={3000}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'حذف تراکنش' }))
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(screen.getByRole('button', { name: 'حذف تراکنش' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'حذف تراکنش' }))
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -w @pat/web -- src/components/ConfirmPress.test.tsx`

Expected: FAIL — module / component missing

- [ ] **Step 4: Implement `ConfirmPress`**

```tsx
import { useEffect, useRef, useState } from 'react'

export type ConfirmPressProps = {
  label: string
  confirmLabel: string
  onConfirm: () => void
  disabled?: boolean
  className?: string
  armTimeoutMs?: number
}

export function ConfirmPress({
  label,
  confirmLabel,
  onConfirm,
  disabled = false,
  className,
  armTimeoutMs = 3000,
}: ConfirmPressProps) {
  const [armed, setArmed] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function clearTimer() {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  function disarm() {
    clearTimer()
    setArmed(false)
  }

  useEffect(() => () => clearTimer(), [])

  useEffect(() => {
    if (disabled) disarm()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled])

  function handleClick() {
    if (disabled) return
    if (!armed) {
      setArmed(true)
      clearTimer()
      timerRef.current = setTimeout(() => setArmed(false), armTimeoutMs)
      return
    }
    disarm()
    onConfirm()
  }

  const classes = [
    'confirm-press',
    armed ? 'confirm-press--armed' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button
      type="button"
      className={classes}
      onClick={handleClick}
      disabled={disabled}
      aria-expanded={armed}
    >
      {armed ? confirmLabel : label}
    </button>
  )
}
```

Add minimal CSS:

```css
.confirm-press {
  font: inherit;
  cursor: pointer;
}
.confirm-press--armed {
  background: var(--danger);
  color: #f4efe6;
  border-color: var(--danger);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -w @pat/web -- src/components/ConfirmPress.test.tsx`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/ConfirmPress.tsx apps/web/src/components/ConfirmPress.test.tsx apps/web/package.json package-lock.json apps/web/vitest.config.ts apps/web/src/styles/global.css
git commit -m "$(cat <<'EOF'
feat(web): add ConfirmPress two-tap control

EOF
)"
```

---

### Task 3: `SegmentedControl` + wire into `TransactionForm`

**Files:**
- Create: `apps/web/src/components/SegmentedControl.tsx`
- Modify: `apps/web/src/components/TransactionForm.tsx`
- Modify: `apps/web/src/styles/global.css`

**Interfaces:**
- Consumes: none
- Produces:
```ts
export type SegmentedOption<T extends string> = { value: T; label: string }
export type SegmentedControlProps<T extends string> = {
  options: SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  disabled?: boolean
  name?: string
}
export function SegmentedControl<T extends string>(
  props: SegmentedControlProps<T>,
): JSX.Element
```

- [ ] **Step 1: Implement `SegmentedControl`**

```tsx
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  disabled = false,
  name,
}: SegmentedControlProps<T>) {
  return (
    <div
      className="segmented"
      role="radiogroup"
      aria-label={name}
    >
      {options.map((opt) => {
        const selected = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            className={
              selected ? 'segmented-item segmented-item--selected' : 'segmented-item'
            }
            disabled={disabled}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Replace radios in `TransactionForm`**

When `mode === 'edit'`, replace the radio block with:

```tsx
<SegmentedControl
  name="tx-type"
  value={type}
  disabled={submitting}
  onChange={setType}
  options={[
    { value: 'deposit', label: 'واریز' },
    { value: 'return', label: 'برگشت' },
  ]}
/>
```

Remove `<input type="radio">` markup.

- [ ] **Step 3: Add segmented CSS**

```css
.segmented {
  display: flex;
  border: 1px solid var(--rule);
  border-radius: 10px;
  overflow: hidden;
}
.segmented-item {
  flex: 1;
  padding: 0.55rem 0.5rem;
  border: none;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: 0.8125rem;
  cursor: pointer;
}
.segmented-item--selected {
  background: var(--accent);
  color: #f4efe6;
  font-weight: 700;
}
.segmented-item:disabled {
  opacity: 0.65;
  cursor: wait;
}
```

Remove unused `.tx-form-type` radio spacing if obsolete, or keep wrapper class on a parent.

- [ ] **Step 4: Run existing web tests**

Run: `npm test -w @pat/web`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/SegmentedControl.tsx apps/web/src/components/TransactionForm.tsx apps/web/src/styles/global.css
git commit -m "$(cat <<'EOF'
feat(web): replace tx type radios with SegmentedControl

EOF
)"
```

---

### Task 4: Rebuild `JalaliDateField` calendar + wire Person

**Files:**
- Modify: `apps/web/src/components/JalaliDateField.tsx`
- Modify: `apps/web/src/components/TransactionForm.tsx` (already uses field — verify still works)
- Modify: `apps/web/src/routes/Person.tsx`
- Modify: `apps/web/src/styles/global.css`

**Interfaces:**
- Consumes: `todayJalali`, `parseJalaliParts`, `shiftJalaliMonth`, `jalaliMonthLabel`, `buildJalaliMonthGrid` from Task 1
- Produces: same public props as today (`value`, `onChange`, `disabled?`, `id?`) but calendar UI

- [ ] **Step 1: Rewrite `JalaliDateField`**

Behavior per spec:
- Button shows `value` (`dir="ltr"`)
- Toggle open calendar
- Month nav ‹ › via `shiftJalaliMonth`
- Grid from `buildJalaliMonthGrid(viewMonth)`
- Day click → `onChange(cell.jalali)` + close
- امروز → `onChange(todayJalali())` + close
- Escape / outside click closes
- Track `viewMonth` state (Jalali `YYYY/MM/01`) reset when opening

Use a wrapper `div.jalali-date` with `ref` for outside-click. Weekday headers: `['ش','ی','د','س','چ','پ','ج']`.

- [ ] **Step 2: Replace Person raw date input**

In `Person.tsx`, import `JalaliDateField` and replace the date `<input>` with:

```tsx
<JalaliDateField
  value={jalaliDate}
  onChange={setJalaliDate}
  disabled={submitting}
/>
```

Keep `todayJalali()` defaults on open/reset.

- [ ] **Step 3: Style calendar**

```css
.jalali-date {
  position: relative;
}
.jalali-date-field {
  /* keep existing field look; make it a button */
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  cursor: pointer;
  text-align: start;
}
.jalali-date-popover {
  position: absolute;
  z-index: 20;
  left: 0;
  right: 0;
  top: calc(100% + 4px);
  padding: 0.625rem;
  border: 1px solid var(--rule);
  border-radius: 12px;
  background: #faf6ef;
  box-shadow: 0 6px 18px rgba(61, 52, 40, 0.12);
}
.jalali-date-nav { display: flex; justify-content: space-between; align-items: center; font-weight: 700; font-size: 0.8125rem; margin-bottom: 0.5rem; }
.jalali-date-nav button { border: none; background: transparent; font: inherit; cursor: pointer; color: var(--ink); padding: 0.25rem 0.5rem; }
.jalali-date-weekdays, .jalali-date-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; text-align: center; }
.jalali-date-weekdays { font-size: 0.625rem; color: var(--muted); margin-bottom: 0.25rem; }
.jalali-date-day { border: none; background: transparent; font: inherit; font-size: 0.75rem; padding: 0.4rem 0; border-radius: 8px; cursor: pointer; color: var(--ink); }
.jalali-date-day--muted { opacity: 0.3; }
.jalali-date-day--selected { background: var(--accent); color: #f4efe6; font-weight: 700; }
.jalali-date-today { display: block; width: 100%; margin-top: 0.5rem; border: none; background: transparent; color: var(--accent); font: inherit; font-size: 0.75rem; font-weight: 700; cursor: pointer; }
```

- [ ] **Step 4: Run tests**

Run: `npm test -w @pat/web`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/JalaliDateField.tsx apps/web/src/routes/Person.tsx apps/web/src/styles/global.css
git commit -m "$(cat <<'EOF'
feat(web): Jalali calendar picker; use on person add-balance

EOF
)"
```

---

### Task 5: Wire ConfirmPress into Balance delete + Settings import

**Files:**
- Modify: `apps/web/src/routes/Balance.tsx`
- Modify: `apps/web/src/routes/Settings.tsx`
- Modify: `apps/web/src/styles/global.css` (ensure `.balance-delete` works with `.confirm-press--armed`)

**Interfaces:**
- Consumes: `ConfirmPress` from Task 2

- [ ] **Step 1: Balance delete**

Remove `if (!window.confirm(...)) return` from `handleDelete`.

Replace delete button with:

```tsx
<ConfirmPress
  label="حذف تراکنش"
  confirmLabel="مطمئنی؟ دوباره بزن"
  onConfirm={() => void handleDelete(editingTx)}
  disabled={submitting}
  className="balance-delete"
/>
```

- [ ] **Step 2: Settings import**

Remove `IMPORT_CONFIRM` constant and `window.confirm` from `handleImportFile`.

Replace import button with:

```tsx
<ConfirmPress
  label={importing ? '…' : 'انتخاب فایل و وارد کردن'}
  confirmLabel="همه داده پاک می‌شه — تأیید"
  onConfirm={handleImportClick}
  disabled={importing}
  className="settings-btn settings-btn--ghost"
/>
```

Ensure armed state still readable on ghost button (CSS: `.settings-btn.confirm-press--armed` fills danger).

- [ ] **Step 3: Grep for leftovers**

Run: `rg "window\\.confirm|type=\"radio\"" apps/web/src`

Expected: no matches (except possibly unrelated)

- [ ] **Step 4: Run full web tests + typecheck**

Run: `npm test -w @pat/web && npm run build -w @pat/web`

Expected: PASS / build succeeds

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/routes/Balance.tsx apps/web/src/routes/Settings.tsx apps/web/src/styles/global.css
git commit -m "$(cat <<'EOF'
feat(web): two-tap confirm for delete and backup import

EOF
)"
```

---

## Spec coverage check

| Spec requirement | Task |
|---|---|
| Jalali calendar popup, no typing, default امروز | 1, 4 |
| Segmented واریز/برگشت | 3 |
| ConfirmPress delete copy | 2, 5 |
| ConfirmPress import louder copy + file on second tap | 2, 5 |
| Remove window.confirm / radios | 3, 5 |
| Notebook CSS | 2–5 |
| Helper + ConfirmPress tests | 1, 2 |

## Execution handoff

User already requested: execute, commit after each task, push. Use **inline executing-plans** in this session (skip re-asking execution choice).
