# Mobile Legibility, Person Delete, Amount Input & Back Navigation — Design

> **Status:** Approved (2026-07-31)
> **Depends on:** [Form controls polish](./2026-07-31-form-controls-polish-design.md), [Typography & copy](./2026-07-31-typography-friend-copy-design.md)
> **Scope:** Phone-legibility type scale, delete-person affordance, digits-only grouped amount input, RTL-correct back control that matches the phone back button
> **Out:** Soft-delete/archive for people; decimal amounts; user-adjustable text-size setting; new datepicker or confirm patterns

---

## 1. Problem

Four issues surfaced from using the app on a phone:

1. **Text is small on the phone.** The token scale in `tokens.css` is only partly used — `global.css` carries 30 hardcoded `font-size` declarations that bypass it entirely, some as small as `0.625rem` (10px).
2. **No way to delete a person.** The API endpoint exists; the UI never exposes it.
3. **Amount input is unconstrained.** It accepts any text and shows no thousands grouping while typing.
4. **Back chevron points the wrong way, and the phone back button behaves differently from the in-app back control.**

---

## 2. Root causes

Each fix targets a verified cause, not the symptom.

### 2.1 Type scale bypassed

`grep -oP 'font-size:\s*\K[0-9.]+rem' src/styles/global.css | sort | uniq -c` yields **30 hardcoded values**:

| Count | Size | px |
|---|---|---|
| 13 | `0.8125rem` | 13 |
| 8 | `0.75rem` | 12 |
| 4 | `0.875rem` | 14 |
| 1 | `1.5rem` | 24 |
| 1 | `1.25rem` | 20 |
| 1 | `1.125rem` | 18 |
| 1 | `0.6875rem` | 11 |
| 1 | `0.625rem` | 10 |

Raising token values alone would leave all 30 unchanged — most of the small text would stay small. There are also no media queries and no base `font-size` on `body`.

### 2.2 Back chevron mirrored by bidi

`Person.tsx:145`, `Settled.tsx:67`, `Balance.tsx:236`, and `Settings.tsx:133` render the character `›` (U+203A, *right*-pointing). U+203A has Unicode property **`Bidi_Mirrored = Yes`** and pairs with U+2039 in `BidiMirroring.txt`. Because the document is RTL (`<html dir="rtl">`, `global.css:7` `direction: rtl`), the renderer paints the **mirror glyph** — so `›` displays as `‹`.

Commit `92f77e4` attempted this fix by swapping `←` for `›`; bidi mirroring silently reverted the intent. Any character-based chevron is subject to the same mechanism.

### 2.3 In-app back pushes history instead of popping

All four back affordances are `<Link to="...">`, which **pushes** a history entry. Navigating Home → Person → in-app back yields the stack `[Home, Person, Home]`. The phone back button then goes *to Person*, so the two controls diverge and navigation feels looped.

---

## 3. Locked decisions

| Topic | Decision |
|---|---|
| Text approach | Bump the token scale **and** replace all 30 hardcoded `font-size` values with tokens |
| Tiny sizes | `0.625` / `0.6875` / `0.75` / `0.875rem` all collapse into `--text-meta` — legibility over fine-grained hierarchy |
| Input size | Inputs land at ≥16px to stop iOS Safari focus auto-zoom |
| Text-size setting | **Not** built (out of scope) |
| Delete person rule | Allowed when `activeCount === 0`; blocked when `activeCount > 0` |
| Delete confirm | Existing two-tap `ConfirmPress`; armed label names what is destroyed |
| Archive/soft delete | **Not** built (out of scope) |
| Amount digits | Persian digits with Persian separator `٬` (U+066C) while typing |
| Amount input set | Latin `0-9`, Persian `۰-۹`, Arabic-Indic `٠-٩` accepted; all else stripped |
| Decimals | **Whole numbers only**; no decimal separator |
| Amount value contract | Component emits canonical **Latin** digit string; Persian grouping is presentation only |
| Chevron | Inline **SVG** path — immune to bidi mirroring |
| Back behavior | `navigate(-1)` so it is the same action as the phone back button |
| Back fallback | When no in-app history exists, `navigate(fallbackTo, { replace: true })` |
| Back element | `<button type="button">`, not `<Link>` — it is a history action, not a URL target |
| Back touch target | 44×44px minimum |

---

## 4. Type scale

### 4.1 Tokens

`src/styles/tokens.css` — the existing six tokens, five of them raised. No new token is needed (see §4.2):

```css
--text-meta:    0.875rem;  /* 14px — captions, footers, badges      (was 0.75rem)   */
--text-status:  0.9375rem; /* 15px — status lines, body text        (was 0.8125rem) */
--text-action:  1rem;      /* 16px — buttons, links, inputs         (was 0.9375rem) */
--text-title:   1.25rem;   /* 20px — titles, and the gear glyph     (was 1.125rem)  */
--text-name:    1.375rem;  /* 22px — person and balance names       (was 1.2rem)    */
--text-amount:  3.25rem;   /* 52px — large amount readout           (unchanged)     */
```

### 4.2 Mapping of hardcoded values

`global.css` has 49 `font-size` declarations: 19 already use tokens, **30 are hardcoded**. All are in `rem`. They map as:

| Existing hardcoded | Count | Becomes |
|---|---|---|
| `0.625rem`, `0.6875rem`, `0.75rem`, `0.875rem` | 14 | `var(--text-meta)` |
| `0.8125rem` | 13 | `var(--text-status)` |
| `1.125rem` (`.home-gear`), `1.25rem` (`.page h1`) | 2 | `var(--text-title)` |
| `1.5rem` (`.nav-back`) | 1 | *declaration removed* |

Two details worth not losing:

- The single `1.5rem` at `global.css:299` belongs to `.nav-back` itself, whose `font-size` is dropped because the chevron becomes an explicitly sized SVG (§7.3). It therefore needs no token — which is why the scale stays at six tokens rather than gaining a `--text-heading`.
- `.auth-error` (`global.css:112`) is `font-size: 0.8125rem !important` — it becomes `var(--text-status) !important`, keeping the `!important`.
- `.home-gear` (`global.css:170`) is an icon glyph rather than text; mapping it to `--text-title` enlarges it slightly, which also improves its tap target.

### 4.3 Acceptance

- `grep -c 'font-size:\s*[0-9]' src/styles/global.css` returns `0`.
- All remaining `font-size` declarations reference a `var(--text-*)` token (expected count: 48, after `.nav-back`'s is removed).
- Form inputs compute to ≥16px.

---

## 5. Delete person

### 5.1 Rule

| Person state | `activeCount` | Delete |
|---|---|---|
| No balances at all | 0 | **Allowed** |
| All balances settled | 0 | **Allowed** |
| Has active balances | > 0 | **Blocked** |

`activeCount` comes from the existing `activeCountForPerson(snapshot, personId)` (`sync/snapshot-utils.ts:60`).

**Known consequence:** the schema cascades `people → balances → transactions` (`0001_init.sql`, `ON DELETE CASCADE`), so deleting a fully-settled person destroys their settled balances and every transaction under them, with no undo. This is accepted; the armed confirm label therefore names the damage.

### 5.2 UI

Placed in the Person page footer region (`routes/Person.tsx`).

**Blocked** (`activeCount > 0`) — no button; hint text instead:

```
برای حذف، اول موجودی‌ها را تسویه کن
```

**Allowed** (`activeCount === 0`) — `ConfirmPress` (`components/ConfirmPress.tsx`), matching transaction delete at `Balance.tsx:326`:

| State | Label |
|---|---|
| Idle | `حذف شخص` |
| Armed, no history | `مطمئنی؟ دوباره بزن` |
| Armed, has settled history | `{n} موجودی تسویه‌شده حذف شود؟` |

`n` is the settled-balance count from `settledBalancesForPerson(snapshot, personId)` (`snapshot-utils.ts:100`).

### 5.3 Data flow

No backend work — `DELETE /people/:id` already exists (`apps/api/src/routes/people.ts:269`).

```
ConfirmPress second tap
  → mutate({ method: 'DELETE', path: `/people/${id}` })
  → (offline) enqueue to outbox + local snapshot update
  → navigate('/', { replace: true })
```

**Offline snapshot update** — required, mirroring the offline handling in `Person.tsx:90` and `Balance.tsx:204`. Removing only the person would orphan its descendants in the cached snapshot, so all three collections are pruned:

```ts
people:       filter out the person id
balances:     filter out balances whose personId === id
transactions: filter out transactions whose balanceId ∈ (removed balance ids)
```

`replace: true` on the redirect keeps a deleted person's URL out of the forward history.

---

## 6. Amount field

### 6.1 `src/format/digits.ts` (new)

`toFaDigits` currently exists as a module-private function in `dates/jalali.ts:36`. It moves here and `jalali.ts` imports it, removing the duplicate.

| Function | Contract |
|---|---|
| `toFaDigits(s)` | Latin digits → Persian digits |
| `toLatinDigits(s)` | Persian `۰-۹` and Arabic-Indic `٠-٩` → Latin `0-9` |
| `groupThousands(latinDigits)` | `"1234567"` → `"1,234,567"` |
| `formatAmountInput(raw)` | Any input → Persian grouped display, e.g. `"۱۲۳٬۴۵۶"` |
| `parseAmountInput(raw)` | Any input → `number` (`0` for empty) |

Normalization order: strip non-digits → strip leading zeros → group → convert to Persian digits with `٬` separator.

### 6.2 `src/components/AmountField.tsx` (new)

Replaces the raw inputs at `Person.tsx:188` and `TransactionForm.tsx:95`.

```ts
type AmountFieldProps = {
  value: string            // canonical Latin digit string, e.g. "123456"
  onChange: (v: string) => void
  placeholder?: string
  disabled?: boolean
  required?: boolean
  autoFocus?: boolean
  className?: string
}
```

**Behavior:**
- Renders `<input type="text" inputMode="numeric">` — numeric keypad, no decimal key.
- Displays `formatAmountInput(value)`; emits canonical Latin digits via `onChange`.
- Non-digit characters are dropped on input; no decimal separator is accepted.
- Leading zeros stripped (`"007"` → `"7"`); empty input stays empty rather than becoming `"0"`.
- `dir="ltr"` on the input so grouped numerals lay out consistently inside the RTL page.

**Caret preservation** — reformatting on each keystroke otherwise forces the caret to the end, making mid-number editing impossible. Algorithm:

1. Before reformat, count digit characters to the left of the caret.
2. Reformat the value.
3. Walk the new string, advancing until that same number of digits has been passed.
4. Set `selectionStart`/`selectionEnd` to that offset.

### 6.3 Call-site changes

| Site | Change |
|---|---|
| `Person.tsx:188` | Raw input → `AmountField`; `amount` state holds canonical Latin digits |
| `Person.tsx:68` | `Number(amount.replace(/,/g, ''))` → `parseAmountInput(amount)` |
| `TransactionForm.tsx:95` | Raw input → `AmountField` |
| `TransactionForm.tsx:41` | Initial value `String(initialAmount)` must be canonical digits so edit mode displays `۱۲۳٬۴۵۶`, not `123456` |
| `TransactionForm.tsx:52` | `Number(amount.replace(/,/g, ''))` → `parseAmountInput(amount)` |

Existing validation (`> 0`, finite) is unchanged. Amounts already stored with decimals remain valid in the DB (`amount REAL`) and still display correctly — only *entry* is constrained.

---

## 7. Back navigation

### 7.1 `src/components/BackButton.tsx` (new)

```ts
type BackButtonProps = {
  fallbackTo: string   // logical parent, used when there is no in-app history
}
```

**Chevron:** inline SVG pointing right, `aria-hidden="true"`, sized via `width`/`height` (not `font-size`). SVG geometry is not bidi-mirrored, so it renders correctly in the RTL document.

**Behavior:**

```
onClick:
  if (window.history.state?.idx > 0)  navigate(-1)
  else                                navigate(fallbackTo, { replace: true })
```

React Router maintains `idx` on `history.state`. An `idx` of `0` or `undefined` means the entry is the first in this session — a PWA cold start, refresh, or deep link — where `navigate(-1)` would leave the app.

**Element:** `<button type="button" className="nav-back" aria-label="بازگشت">`. Replaces `<Link>` because the control now performs a history action rather than targeting a URL.

**Accepted tradeoff:** `navigate(-1)` follows real history, so reaching a screen by an unusual path means back returns along that path rather than to the logical parent. This is inherent to matching the phone back button and is the requested behavior.

### 7.2 Call sites

| File | Line | `fallbackTo` |
|---|---|---|
| `routes/Person.tsx` | 145 | `/` |
| `routes/Settings.tsx` | 133 | `/` |
| `routes/Settled.tsx` | 67 | `/people/${id}` |
| `routes/Balance.tsx` | 236 | `/people/${detail.personId}` — `/` when `detail` is null |

### 7.3 Styling

`.nav-back` (`global.css:296`): drop `font-size`/`font-weight` (SVG-sized now), add a 44×44px minimum touch target, keep `color: var(--ink)`, reset default button `background`/`border`/`padding`.

---

## 8. Testing

Existing stack: `vitest` + `@testing-library/react` + `jsdom`.

### 8.1 `src/format/digits.test.ts` (new)

- `toLatinDigits` normalizes Persian, Arabic-Indic, and mixed digit sets.
- `groupThousands`: `""`, `"1"`, `"123"`, `"1234"`, `"1234567"`.
- `formatAmountInput` strips non-digits, strips leading zeros, keeps empty empty, emits `٬`.
- `parseAmountInput` round-trips with `formatAmountInput`; `""` → `0`.
- Large value (e.g. `"999999999999"`) groups without precision loss.

### 8.2 `src/components/AmountField.test.tsx` (new)

- Typing `1234567` yields display `۱٬۲۳۴٬۵۶۷` and emits `"1234567"`.
- Letters, punctuation, and `.` are rejected.
- Persian digits typed directly are accepted and normalized.
- Caret stays put when inserting a digit mid-string.
- `inputMode="numeric"` is set.

### 8.3 `src/components/BackButton.test.tsx` (new)

- With `history.state.idx > 0`, click calls `navigate(-1)`.
- With `idx` `0`/absent, click navigates to `fallbackTo` with `replace: true`.
- Renders an SVG (not a text chevron) and keeps `aria-label="بازگشت"`.

### 8.4 Person delete

- Delete control absent when `activeCount > 0`; hint shown instead.
- Delete control present when `activeCount === 0`.
- Two taps required before `mutate` fires.
- Armed label reports the settled-balance count when history exists.
- Offline path prunes person, their balances, and their transactions from the snapshot.

### 8.5 Type scale and visual QA

No unit test. Verified by:
- `grep -c 'font-size:\s*[0-9]' src/styles/global.css` → `0`.
- Screenshot QA at a phone viewport (≈390×844) across Home, Person, Balance, Settled, Settings — confirming legibility, a right-pointing chevron, and grouped Persian amounts.

---

## 9. Out of scope

- Soft delete / archive / restore for people (schema change).
- Decimal amount entry.
- User-adjustable text-size preference.
- Media queries or per-breakpoint type scales.
- Changes to `ConfirmPress`, `JalaliDateField`, or `SegmentedControl` behavior.
