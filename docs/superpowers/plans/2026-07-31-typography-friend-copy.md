# Typography & Friend Copy Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tighten type hierarchy, rewrite UI copy to informal friend voice (تو), and replace design-note footers with counts / quiet freshness.

**Architecture:** CSS type tokens in `tokens.css` mapped through `global.css`; small `formatRelativeFa` helper for footer freshness; SyncContext exposes `lastSyncedAt` from snapshot `updatedAt`; route footers compute counts from loaded data; Persian strings updated in place (no i18n framework).

**Tech Stack:** React + Vite PWA, Vazirmatn, Vitest, existing SyncContext / IndexedDB snapshot.

## Global Constraints

- Informal «تو» — never address user as «شما» in UI chrome
- Keep product nouns: امانت‌ها، موجودی، واریز، برگشت، تسویه، تسویه‌شده‌ها، افزودن موجودی، موجودی فعلی
- Amount hero `--text-amount: 3.25rem`; names `--text-name: 1.2rem`
- List footers = counts; Balance quiet when fine; Settings = freshness
- Do not redesign layout, colors, or IA
- Commit after each task; push when all tasks complete

---

### Task 1: Commit design spec

**Files:**
- Create: `docs/superpowers/specs/2026-07-31-typography-friend-copy-design.md`
- Create: `docs/superpowers/plans/2026-07-31-typography-friend-copy.md` (this plan)

- [ ] **Step 1: Ensure spec + plan are on disk**

Verify both files exist under `docs/superpowers/`.

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-07-31-typography-friend-copy-design.md \
  docs/superpowers/plans/2026-07-31-typography-friend-copy.md
git commit -m "$(cat <<'EOF'
docs: typography and friend-copy polish spec and plan

EOF
)"
```

---

### Task 2: Relative time helper (TDD)

**Files:**
- Create: `apps/web/src/dates/relative-fa.ts`
- Create: `apps/web/src/dates/relative-fa.test.ts`

**Interfaces:**
- Produces: `formatRelativeFa(iso: string, now?: Date): string`
  - Returns one of: `همین الان` (< 60s), `N دقیقه پیش` (1–59 min, fa digits), `N ساعت پیش` (1–23 h), `امروز` (same calendar day beyond 23h edge use day check), `دیروز`, or `D ماه YYYY` via existing Jalali short form if older — for v1: if ≥ 48h use `formatJalali(iso)` from `./jalali`.

- [ ] **Step 1: Write failing tests**

```ts
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
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npm test -w apps/web -- src/dates/relative-fa.test.ts`
Expected: FAIL (module missing)

- [ ] **Step 3: Implement**

```ts
import { formatJalali, toFaDigits } from './jalali'

export function formatRelativeFa(iso: string, now: Date = new Date()): string {
  const then = new Date(iso)
  const diffMs = now.getTime() - then.getTime()
  if (Number.isNaN(diffMs) || diffMs < 0) return formatJalali(iso.slice(0, 10))
  const sec = Math.floor(diffMs / 1000)
  if (sec < 60) return 'همین الان'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${toFaDigits(String(min))} دقیقه پیش`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${toFaDigits(String(hr))} ساعت پیش`
  const dayMs = 24 * 60 * 60 * 1000
  if (diffMs < 2 * dayMs) return 'دیروز'
  return formatJalali(iso.slice(0, 10))
}
```

If `toFaDigits` is not exported from `jalali.ts`, export the existing helper or duplicate a one-liner mapping `0-9` → `۰-۹`.

- [ ] **Step 4: Run tests — expect PASS**

Run: `npm test -w apps/web -- src/dates/relative-fa.test.ts`

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/dates/relative-fa.ts apps/web/src/dates/relative-fa.test.ts apps/web/src/dates/jalali.ts
git commit -m "$(cat <<'EOF'
feat(web): add Persian relative time helper for footers

EOF
)"
```

---

### Task 3: Type tokens + CSS mapping

**Files:**
- Modify: `apps/web/src/styles/tokens.css`
- Modify: `apps/web/src/styles/global.css`

**Interfaces:**
- Produces CSS vars: `--text-amount`, `--text-name`, `--text-title`, `--text-action`, `--text-status`, `--text-meta`

- [ ] **Step 1: Add tokens**

In `tokens.css` `:root`:

```css
--text-amount: 3.25rem;
--text-name: 1.2rem;
--text-title: 1.125rem;
--text-action: 0.9375rem;
--text-status: 0.8125rem;
--text-meta: 0.75rem;
```

- [ ] **Step 2: Map classes in `global.css`**

- `.home-title`, `.person-title`, `.settings-title` → `font-size: var(--text-title)`
- `.person-row__name`, `.balance-row__label` → `font-size: var(--text-name); font-weight: 700`
- `.person-row__meta` → `font-size: var(--text-status)`
- `.home-add`, similar text actions → `font-size: var(--text-action)`
- `.balance-hero-num` → `font-size: var(--text-amount)`
- `.home-cap`, `.person-cap`, `.balance-cap`, `.settings-cap`, `.sync-banner`, section labels that are meta → `font-size: var(--text-meta)`
- `.balance-row__qty` → at least `var(--text-name)` weight 700 so amounts on person list read clearly

- [ ] **Step 3: Visual smoke** — open home + balance in browser if `npm run dev` available; else skip and rely on later tasks.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/styles/tokens.css apps/web/src/styles/global.css
git commit -m "$(cat <<'EOF'
feat(web): add type scale tokens and map UI classes

EOF
)"
```

---

### Task 4: SyncContext lastSyncedAt + informal SyncBanner

**Files:**
- Modify: `apps/web/src/sync/SyncContext.tsx`
- Modify: `apps/web/src/components/SyncBanner.tsx`

**Interfaces:**
- Extends `SyncContextValue` with `lastSyncedAt: string | null`
- On successful `refresh` / when loading snapshot, set `lastSyncedAt` from `snapshot.updatedAt`
- On init, read `getSnapshot()` and set `lastSyncedAt` if present

- [ ] **Step 1: Expose `lastSyncedAt`**

Add state `lastSyncedAt`, update after `setSnapshot` in refresh, and on mount from cache. Include in context value memo.

- [ ] **Step 2: Rewrite SyncBanner**

```ts
const message = !online
  ? 'آفلاینی — تغییرات اینجا می‌مونه'
  : `${pendingCount.toLocaleString('fa-IR')} تغییر در انتظار همگام‌سازی`
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/sync/SyncContext.tsx apps/web/src/components/SyncBanner.tsx
git commit -m "$(cat <<'EOF'
feat(web): expose lastSyncedAt and informal sync banner

EOF
)"
```

---

### Task 5: Friend-copy string pass

**Files:**
- Modify: routes/components listed below
- Modify: `packages/domain/src/status.ts` + `packages/domain/tests/status.test.ts` for fa digits
- Modify: `apps/web/src/api/client.ts` error map if formal
- Modify: `apps/web/src/routes/Login.tsx`, `Settings.tsx`, etc.

**Approved replacements (must):**

| Location | New copy |
|---|---|
| Home empty | هنوز کسی اضافه نکردی |
| Person empty | موجودی فعالی نداری |
| Settled empty | چیزی تو تسویه‌شده‌ها نیست |
| SyncBanner offline | (done in Task 4) |

**Also informalize (must if present):**

- Settings import confirm: end with `ادامه می‌دی؟` not `ادامه می‌دهید؟`
- Login: `رمزتو وارد کن` / setup lead without formal شما
- Login offline-ish errors stay clear; prefer تو where addressing user
- `شما آفلاین` must not remain anywhere in `apps/web`

- [ ] **Step 1: Update `personShortStatus` to fa digits**

```ts
export function personShortStatus(activeCount: number): string {
  if (activeCount > 0) {
    return `${activeCount.toLocaleString('fa-IR')} موجودی فعال`
  }
  return 'تسویه'
}
```

Update tests accordingly.

- [ ] **Step 2: Sweep routes for friend copy**

Apply table above + Settings/Login/confirm strings.

- [ ] **Step 3: Run domain + web tests**

Run: `npm test -w packages/domain && npm test -w apps/web`

- [ ] **Step 4: Commit**

```bash
git add apps/web packages/domain
git commit -m "$(cat <<'EOF'
feat: informal friend-voice Persian copy across UI

EOF
)"
```

---

### Task 6: Useful footers

**Files:**
- Modify: `apps/web/src/routes/Home.tsx`
- Modify: `apps/web/src/routes/Person.tsx`
- Modify: `apps/web/src/routes/Settled.tsx`
- Modify: `apps/web/src/routes/Balance.tsx`
- Modify: `apps/web/src/routes/Settings.tsx`
- Optional small helper: `apps/web/src/components/ScreenCap.tsx` — only if it reduces duplication; otherwise inline.

**Footer rules:**

- Home: `${people.length.toLocaleString('fa-IR')} نفر · ${totalActive.toLocaleString('fa-IR')} موجودی فعال` where `totalActive = sum(person.activeCount)`
- Person: `${activeBalances.length.toLocaleString('fa-IR')} موجودی فعال`
- Settled: `${settled.length.toLocaleString('fa-IR')} تسویه‌شده`
- Balance: if SyncBanner would show (`!online || pendingCount > 0`) → empty footer text (spacer class ok). Else if `lastSyncedAt` → `همگام · ${formatRelativeFa(lastSyncedAt)}`. Else empty.
- Settings: if offline → `ذخیره محلی`; else if `lastSyncedAt` → `همگام · ${formatRelativeFa(lastSyncedAt)}`; else empty or `همگام`

- [ ] **Step 1: Implement footers per screen**

- [ ] **Step 2: Smoke-check TypeScript**

Run: `npm run check` or `npx tsc -b` as used in repo

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/routes apps/web/src/components
git commit -m "$(cat <<'EOF'
feat(web): replace design-note footers with counts and freshness

EOF
)"
```

---

### Task 7: Push

- [ ] **Step 1: Verify git status clean (or only ignored brainstorm files)**

- [ ] **Step 2: Push**

```bash
git push -u origin HEAD
```

---

## Spec coverage check

| Spec item | Task |
|---|---|
| Type scale tokens + mapping | 3 |
| Bolder amount 3.25rem | 3 |
| Friend copy empty/offline | 4, 5 |
| Product nouns unchanged | 5 |
| Footer counts / quiet / freshness | 2, 4, 6 |
| lastSyncedAt / relative fa | 2, 4, 6 |
| Out of scope (no layout/IA) | — respected |
