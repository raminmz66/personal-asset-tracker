# Form Controls Polish — Design

> **Status:** Approved (2026-07-31)  
> **Depends on:** [UI/UX design](./2026-07-31-personal-asset-custody-tracker-ui-design.md)  
> **Scope:** Replace typed Jalali dates, `window.confirm`, and native radios with custom notebook-styled controls  
> **Out:** New confirm patterns beyond two-tap; third-party datepicker libraries; Gregorian UI dates

---

## 1. Problem

Three form affordances feel browser-default and friction-heavy:

1. **Dates** — `JalaliDateField` and Person add-balance use a free-text `YYYY/MM/DD` input.
2. **Confirms** — transaction delete and backup import use `window.confirm`.
3. **Type radios** — edit-mode واریز / برگشت uses native `<input type="radio">`.

---

## 2. Locked decisions

| Topic | Decision |
|---|---|
| Approach | Small custom components; no new datepicker dependency (`dayjs` + `jalaliday` already present) |
| Date entry | Jalali calendar popup only; **no free typing** |
| Date default | امروز (`todayJalali()`) on new forms; edit keeps existing date |
| Confirm pattern | Two-tap arm → commit (`ConfirmPress`); no modal |
| Delete arm copy | Idle: «حذف تراکنش» · Armed: «مطمئنی؟ دوباره بزن» |
| Import arm copy | Idle: «انتخاب فایل و وارد کردن» · Armed: «همه داده پاک می‌شه — تأیید» |
| Import flow | Second tap opens file picker; after file chosen, import runs **without** another confirm |
| Type selector | Segmented two-option control (واریز \| برگشت) in edit mode only |
| Visual | Match notebook tokens (`--page`, `--ink`, `--rule`, `--accent`, `--danger`) |
| Copy voice | Informal friend Persian (existing app voice) |

---

## 3. Components

### 3.1 `JalaliDateField`

**Role:** Pick a Jalali calendar day without typing.

**Behavior:**
- Renders a button-like field showing the current Jalali value (`YYYY/MM/DD`, `dir="ltr"`).
- Default value for create flows remains امروز (callers pass `todayJalali()` / leave unset).
- Tap toggles a popover calendar attached below the field.
- Calendar shows: month title (e.g. «مرداد ۱۴۰۴»), ‹ › month nav, weekday headers (ش…ج), day grid, and an **امروز** shortcut that sets today and closes.
- Selecting a day sets the value and closes the popover.
- Outside click / Escape closes without changing the value.
- Disabled when parent form is submitting.
- Not a free-text `<input>` — value changes only via calendar / امروز.

**API:**
```ts
type JalaliDateFieldProps = {
  value: string // Jalali YYYY/MM/DD
  onChange: (value: string) => void
  disabled?: boolean
  id?: string
}
```

**Call sites:** `TransactionForm`, Person add-balance form (replace raw text input).

**Helpers** (extend `apps/web/src/dates/jalali.ts` as needed): month label, build month day grid (leading/trailing padding days), shift month, parse year/month/day from Jalali string.

### 3.2 `SegmentedControl`

**Role:** Exclusive two-option control replacing radios.

**Behavior:**
- Horizontal segmented bar; selected segment uses accent fill + light text; unselected muted.
- Keyboard: arrow keys move selection when focused; Enter/Space activate focused segment.
- Used only for transaction type in edit mode: `واریز` | `برگشت`.

**API:**
```ts
type SegmentedOption<T extends string> = { value: T; label: string }

type SegmentedControlProps<T extends string> = {
  options: SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  disabled?: boolean
  name?: string
}
```

### 3.3 `ConfirmPress`

**Role:** Destructive action with two-tap confirmation (no modal).

**Behavior:**
- Idle: shows `label`, outline/danger styling appropriate to context.
- First press: enters **armed** state; shows `confirmLabel`; fills danger background.
- Second press (while armed): calls `onConfirm`, returns to idle.
- Auto-disarm after **3 seconds** without a second press.
- Escape or blur (optional, recommended): disarm.
- `disabled` prevents arming and confirming.
- Does not use `window.confirm`.

**API:**
```ts
type ConfirmPressProps = {
  label: string
  confirmLabel: string
  onConfirm: () => void
  disabled?: boolean
  className?: string
  armTimeoutMs?: number // default 3000
}
```

**Call sites:**
- Balance edit: delete transaction
- Settings: import trigger (wraps current “open file picker” action)

---

## 4. Integration

### 4.1 Balance delete
Replace delete `<button>` + `window.confirm` with:

```tsx
<ConfirmPress
  label="حذف تراکنش"
  confirmLabel="مطمئنی؟ دوباره بزن"
  onConfirm={() => void handleDelete(editingTx)}
  disabled={submitting}
  className="balance-delete"
/>
```

`handleDelete` no longer calls `window.confirm`.

### 4.2 Settings import
Replace import button + post-file `window.confirm` with `ConfirmPress`:

- Idle label: «انتخاب فایل و وارد کردن»
- Confirm label: «همه داده پاک می‌شه — تأیید»
- `onConfirm` → open hidden file input (existing `handleImportClick`)
- `handleImportFile` proceeds to parse/import **without** `window.confirm`

### 4.3 TransactionForm type
When `mode === 'edit'`, replace radio pair with `SegmentedControl` bound to deposit/return.

### 4.4 Person add balance
Replace Jalali text `<input>` with shared `JalaliDateField`.

---

## 5. Visual / CSS

- Extend `global.css` (and tokens if needed) for:
  - date field + calendar popover / grid / today link
  - segmented control
  - confirm-press idle vs armed states (reuse `--danger`)
- Keep mobile-first; calendar must fit within ~480px shell.
- No purple gradients, no default OS chrome for these three controls.

---

## 6. Error handling & edge cases

| Case | Behavior |
|---|---|
| Invalid existing `value` on date field | Fall back display/nav to امروز for the open calendar month; keep calling `onChange` only on valid picks |
| Arm timeout | Return to idle label; no action |
| Import file cancel | No import; ConfirmPress already returned to idle after `onConfirm` fired (file dialog opened) |
| Double-submit while deleting/importing | Parent `disabled={submitting\|importing}` blocks further presses |

---

## 7. Testing

- Unit: Jalali month-grid helpers (known month layout, امروز string, month shift).
- Component (Vitest + React if already patterned; otherwise logic-focused tests): ConfirmPress arm → confirm; arm → timeout disarm; SegmentedControl onChange.
- Manual smoke: create balance with calendar; edit tx type via segment; two-tap delete; two-tap import.

---

## 8. Success criteria

- User never types a date for create/edit/add-balance.
- New date fields default to امروز.
- No `window.confirm` remains in web app for delete or import.
- No native radios for transaction type.
- Controls match notebook visual system and informal Persian copy.
