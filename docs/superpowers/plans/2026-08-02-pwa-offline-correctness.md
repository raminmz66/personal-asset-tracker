# PWA Offline Correctness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the installed app usable offline, stop losing and stalling queued writes, and finish the install story on iOS and Android.

**Architecture:** Three layers, each with a pure testable core. `api/client.ts` turns a `fetch` rejection into `{ ok: false, status: 0 }` instead of an escaping exception. A local session marker in IndexedDB lets `AuthGate` decide what to render when the server is unreachable. Client-minted row IDs make `POST` idempotent, which is what makes retrying an ambiguous failure safe; `classifyFlush` then drains the outbox instead of jamming on the first dead entry.

**Tech Stack:** TypeScript, React 19, react-router 7, Vitest + Testing Library (jsdom) for web, Vitest (node) for api, `idb` for IndexedDB, vite-plugin-pwa (generateSW), Hono on Cloudflare Workers + D1. npm workspaces: `@pat/domain`, `@pat/web`, `@pat/api`.

**Spec:** [docs/superpowers/specs/2026-08-02-pwa-offline-correctness-design.md](../specs/2026-08-02-pwa-offline-correctness-design.md)

## Global Constraints

- **No DB migration and no new API route.** The only API change is an additive optional `id` in three create bodies.
- **No `toBeInTheDocument()`.** `apps/web/vitest.config.ts` declares no `setupFiles`, so `@testing-library/jest-dom` matchers are NOT loaded. Use `toBeTruthy()` / `toBe()` / `toEqual()`.
- **Every web component test must call `cleanup()` in `afterEach`.** No global auto-cleanup is configured.
- **Every `font-size` in `global.css` must reference a `var(--text-*)` token.** Existing invariant. Do not add raw `px`/`rem` font sizes.
- **Copy is informal Persian** ("friend voice"), per the typography-friend-copy spec. Exact strings, verbatim:
  - `آفلاینی — برای ورود باید به اینترنت وصل بشی`
  - `دوباره امتحان کن`
  - `ارتباط با سرور برقرار نشد.`
  - `آفلاینی — تغییرات اینجا می‌مونه`
  - `تغییرات ثبت‌نشده`
  - `پاک کن`
  - `همه رو پاک کن`
  - `هنوز همگام نشده. خارج بشی پاک می‌شه.`
  - `خروج از حساب`
  - `به‌هرحال خارج شو`
- **There is no D1 or Miniflare test harness in `apps/api`.** Existing api tests are pure-node unit tests of pure modules. Do not attempt to add route tests; extract the pure part and verify the D1 path manually per Task 12.
- **Persian digits.** Any count rendered to the user goes through `toLocaleString('fa-IR')`, matching `SyncBanner.tsx`.
- **Commit after every task**, using the message given in that task's final step.

---

### Task 1: Share the session TTL between api and web

**Files:**
- Create: `packages/domain/src/session.ts`
- Modify: `packages/domain/src/index.ts` (append an export line)
- Modify: `apps/api/src/auth.ts:2`
- Test: `packages/domain/tests/session.test.ts`

**Interfaces:**
- Produces: `SESSION_TTL_MS: number` exported from `@pat/domain`

- [ ] **Step 1: Write the failing test**

`packages/domain/tests/session.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { SESSION_TTL_MS } from "../src/session";

describe("SESSION_TTL_MS", () => {
  it("is thirty days in milliseconds", () => {
    expect(SESSION_TTL_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });
});
```

- [ ] **Step 2: Implement**

`packages/domain/src/session.ts`:

```ts
/**
 * How long a signed-in session lasts. Shared so the api's cookie lifetime and
 * the web app's offline unlock marker cannot drift apart.
 */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
```

Append to `packages/domain/src/index.ts`:

```ts
export { SESSION_TTL_MS } from "./session";
```

In `apps/api/src/auth.ts`, replace the literal on line 2 with a re-export so existing importers (including `tests/auth.test.ts`) keep working:

```ts
import { SESSION_TTL_MS } from "@pat/domain";

export { SESSION_TTL_MS };
export const SESSION_MAX_AGE_SECONDS = SESSION_TTL_MS / 1000;
```

- [ ] **Step 3: Verify** — `npm run test:all` passes.
- [ ] **Step 4: Commit** — `refactor(domain): share SESSION_TTL_MS between api and web`

---

### Task 2: Turn a network failure into a value

**Files:**
- Modify: `apps/web/src/api/client.ts` (`authFetch`, `apiFetch`, `exportBackup`, `API_ERROR_MESSAGES`)
- Test: `apps/web/src/api/client.test.ts` (new)

**Interfaces:**
- `FetchResult<T>` unchanged in shape; the failure branch gains the documented sentinel `status: 0` meaning "never reached the server", with `error: 'offline'`.

- [ ] **Step 1: Write the failing tests**

`apps/web/src/api/client.test.ts` — stub `globalThis.fetch` with `vi.fn()`, restore in `afterEach`:

```ts
it('reports status 0 when the network rejects', async () => {
  globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
  const result = await api.status()
  expect(result).toEqual({ ok: false, status: 0, error: 'offline' })
})

it('still reports the server error code when the server answers', async () => {
  globalThis.fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ error: 'invalid_credentials' }), { status: 401 }),
  )
  const result = await api.login('nope')
  expect(result).toEqual({ ok: false, status: 401, error: 'invalid_credentials' })
})
```

Add the same pair for a `people.list()` call, so `apiFetch` is covered independently of `authFetch`.

- [ ] **Step 2: Implement**

In `authFetch`, `apiFetch` and the inline `fetch` inside `exportBackup`, wrap the call:

```ts
let res: Response
try {
  res = await fetch(...)
} catch {
  return { ok: false, status: 0, error: 'offline' }
}
```

Add to `API_ERROR_MESSAGES`:

```ts
offline: 'ارتباط با سرور برقرار نشد.',
```

- [ ] **Step 3: Verify** — `npm run test -w @pat/web` passes.
- [ ] **Step 4: Commit** — `fix(web): return a status-0 result instead of throwing on network failure`

---

### Task 3: Local session marker

**Files:**
- Create: `apps/web/src/auth/local-session.ts`
- Modify: `apps/web/src/sync/cache.ts` (add `SESSION_KEY` and generic kv helpers if useful)
- Test: `apps/web/src/auth/local-session.test.ts`

**Interfaces:**
- `isSessionValid(session: LocalSession | undefined, now: Date): boolean` — pure
- `getLocalSession() / setLocalSession(now: Date) / clearLocalSession()` — IndexedDB, key `pat:session`

- [ ] **Step 1: Write the failing tests** — cover `isSessionValid` only (the IDB wrappers are exercised through Task 4's component tests):

| Case | Expected |
|---|---|
| `undefined` | `false` |
| `expiresAt` one hour in the future | `true` |
| `expiresAt` one hour in the past | `false` |
| `expiresAt` exactly `now` | `false` (expiry is exclusive) |
| `expiresAt` not a parseable date | `false` |

- [ ] **Step 2: Implement**

```ts
import { SESSION_TTL_MS } from '@pat/domain'

export type LocalSession = { expiresAt: string }

export function isSessionValid(
  session: LocalSession | undefined,
  now: Date,
): boolean {
  if (!session) return false
  const expiry = Date.parse(session.expiresAt)
  if (Number.isNaN(expiry)) return false
  return expiry > now.getTime()
}
```

The marker holds no token and grants nothing to the server — it only records that this device was signed in recently, so the UI can decide what to render while the server is unreachable. Say so in a comment at the top of the file.

Add `export const SESSION_KEY = 'pat:session'` to `cache.ts` beside the existing key constants, and use the same `getDb()` instance.

- [ ] **Step 3: Verify** — `npm run test -w @pat/web` passes.
- [ ] **Step 4: Commit** — `feat(web): add a local session marker for offline unlock`

---

### Task 4: AuthGate offline decision table

**Files:**
- Modify: `apps/web/src/auth/AuthGate.tsx` (whole component)
- Modify: `apps/web/src/routes/Login.tsx` (the `useEffect` at line 31, and the login/setup success paths)
- Modify: `apps/web/src/styles/global.css` (styles for the offline-locked screen)
- Test: `apps/web/src/auth/AuthGate.test.tsx` (new)

**Interfaces:**
- `AuthGate` state becomes `'loading' | 'authenticated' | 'unauthenticated' | 'setup' | 'offline-locked'`

- [ ] **Step 1: Write the failing tests**

With `globalThis.fetch` mocked and the IDB marker seeded through `setLocalSession` / `clearLocalSession`:

| `api.status()` | Marker | Expected |
|---|---|---|
| rejects | valid | children render |
| rejects | absent | offline-locked copy renders |
| rejects | expired | offline-locked copy renders |
| `{ authenticated: true }` | absent | children render, and a marker now exists |
| `{ authenticated: false }` | valid | redirected to `/login`, and the marker is gone |

Wrap in a `MemoryRouter`; assert on `screen.queryByText(...)` with `toBeTruthy()` / `toBeNull()`.

- [ ] **Step 2: Implement the decision table**

```
read local session
call api.status()
  ok                        → authoritative:
      authenticated         → setLocalSession(now); 'authenticated'
      setupRequired         → clearLocalSession(); 'setup'
      otherwise             → clearLocalSession(); 'unauthenticated'
  status === 0              → isSessionValid(marker, now) ? 'authenticated' : 'offline-locked'
  any other failure         → clearLocalSession(); 'unauthenticated'
```

Only `status === 0` takes the offline branch. A `500` from the Worker is a server problem, not an offline device, and must not silently unlock the app.

- [ ] **Step 3: Add the offline-locked screen**

```tsx
if (state === 'offline-locked') {
  return (
    <div className="page auth-offline">
      <p>آفلاینی — برای ورود باید به اینترنت وصل بشی</p>
      <button type="button" className="auth-retry" onClick={recheck}>
        دوباره امتحان کن
      </button>
    </div>
  )
}
```

Not a redirect to `/login`: `/login` cannot authenticate anyone without a network.

- [ ] **Step 4: Stop re-checking on every navigation**

The effect currently depends on `location.pathname`, so it issues a `/api/auth/status` round trip per navigation — which on a flaky link would now flicker the app between online and offline modes. Change the dependency to `[]` (mount only), and add a second effect that re-runs the check on `visibilitychange` when `document.visibilityState === 'visible'`. Keep the `cancelled` guard in both.

- [ ] **Step 5: Fix Login the same way**

Give the `useEffect` at `Login.tsx:31` a `status === 0` branch that sets an `offline` flag and clears `loading`, rendering the same offline copy instead of the permanent spinner. On a successful `api.setup()` or `api.login()`, call `setLocalSession(new Date())` before navigating.

- [ ] **Step 6: Style** — `.auth-offline` reuses the existing `.auth-loading` centring; `.auth-retry` reuses the existing button token sizes. No new `--text-*` tokens.
- [ ] **Step 7: Verify** — `npm run test -w @pat/web` passes.
- [ ] **Step 8: Commit** — `fix(web): render the app offline instead of hanging on a spinner`

---

### Task 5: Accept a client-supplied row id (server)

**Files:**
- Create: `apps/api/src/ids.ts`
- Modify: `apps/api/src/routes/people.ts:186` (create handler)
- Modify: `apps/api/src/routes/balances.ts:227-228` (create-with-deposit) and `:335` (create transaction)
- Test: `apps/api/tests/ids.test.ts`

**Interfaces:**
- `resolveId(candidate: unknown): string` — returns the candidate when it is a well-formed lowercase UUID v4, otherwise `crypto.randomUUID()`

- [ ] **Step 1: Write the failing tests** for `resolveId`:

| Input | Expected |
|---|---|
| a valid v4 UUID | returned unchanged |
| the same UUID uppercased | returned lowercased |
| `undefined`, `null`, `''`, `42`, `{}` | a freshly minted UUID (matches the UUID regex, differs from input) |
| `'not-a-uuid'` | a freshly minted UUID |
| a v1 UUID | a freshly minted UUID (version nibble must be `4`) |

- [ ] **Step 2: Implement `resolveId`**

```ts
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

export function resolveId(candidate: unknown): string {
  if (typeof candidate === 'string') {
    const normalised = candidate.toLowerCase()
    if (UUID_V4.test(normalised)) return normalised
  }
  return crypto.randomUUID()
}
```

Rejecting anything non-v4 is deliberate: it keeps the id space identical to what the server already produces, so nothing downstream has to cope with a new id shape.

- [ ] **Step 3: Wire it into the three create handlers**

- `people.ts`: `const id = resolveId(body.id)`
- `balances.ts` create-with-deposit: `const balanceId = resolveId(body.id)` and `const txId = resolveId(body.txId)`
- `balances.ts` create transaction: `const id = resolveId(body.id)`

- [ ] **Step 4: Make a duplicate id idempotent**

Wrap each `INSERT` (and the `batch` in create-with-deposit) in `try`/`catch`. When the error message contains `UNIQUE` or `PRIMARY KEY`, the row already exists because a retried queue entry got through the first time — so `SELECT` it and return it with `200` instead of `201`. Any other error rethrows.

For create-with-deposit, the `batch` is atomic, so a duplicate `balanceId` fails the whole batch cleanly; refetch the balance and its transactions and return the same shape the success path returns.

This is what §5.1 of the spec depends on: it is why queueing an ambiguous failure cannot double-post a transaction.

- [ ] **Step 5: Verify** — `npm run test -w @pat/api` passes. (The D1 path is verified manually in Task 12 — there is no Miniflare harness here.)
- [ ] **Step 6: Commit** — `feat(api): accept a client-supplied row id and make creates idempotent`

---

### Task 6: Queue on any unreachable server (client)

**Files:**
- Modify: `apps/web/src/sync/SyncContext.tsx` (`mutate`, `MutateResult`)
- Modify: `apps/web/src/routes/Home.tsx` (1 block), `Person.tsx` (2 blocks), `Balance.tsx` (5 blocks)
- Test: `apps/web/src/sync/mutate-policy.test.ts` (new), plus updates to the existing route tests

**Interfaces:**
- `mutate(input: MutateInput): Promise<MutateResult>` where `MutateResult = { queued: boolean }`
- New pure helper `classifyMutate(status: number): 'queue' | 'auth' | 'error' | 'ok'` in `apps/web/src/sync/mutate-policy.ts`

- [ ] **Step 1: Write the failing tests** for `classifyMutate`:

| Status | Expected |
|---|---|
| `0` (never reached the server) | `queue` |
| `408`, `429`, `500`, `502`, `503`, `504` | `queue` |
| `401` | `auth` |
| `400`, `403`, `404`, `409`, `422` | `error` |
| `200`, `201`, `204` | `ok` |

- [ ] **Step 2: Rewrite `mutate`**

```
if (!navigator.onLine)                 → enqueue, return { queued: true }
try { res = await fetch(...) }
catch                                  → enqueue, return { queued: true }
switch (classifyMutate(res.status))
  'queue'  → enqueue, return { queued: true }
  'auth'   → clearLocalSession(); forceLogin(); return { queued: false }
  'error'  → throw new MutateError(code)
  'ok'     → await refresh(); return { queued: false }
```

- [ ] **Step 3: Generate ids before mutating**

Each of the 8 optimistic blocks currently mints `crypto.randomUUID()` *after* the call. Move the mint above the `mutate` call and pass it in the body (`id`, plus `txId` for create-with-deposit), so the optimistic snapshot row and the eventual server row share an id.

- [ ] **Step 4: Switch the condition**

Change all 8 blocks from `if (!online)` to `if (result.queued)`. Grep afterwards: `grep -rn 'if (!online)' apps/web/src/routes` must return zero matches.

- [ ] **Step 5: Verify** — `npm run test -w @pat/web` passes.
- [ ] **Step 6: Commit** — `fix(web): queue writes whenever the server is unreachable, not just when offline`

---

### Task 7: Drain the outbox instead of jamming

**Files:**
- Create: `apps/web/src/sync/flush-policy.ts`
- Modify: `apps/web/src/sync/flush.ts` (the loop)
- Modify: `apps/web/src/sync/cache.ts` (add `FAILED_KEY`, `getFailed`, `setFailed`)
- Test: `apps/web/src/sync/flush-policy.test.ts`

**Interfaces:**
- `classifyFlush(status: number, method: string): 'drop' | 'retry' | 'park' | 'auth'`
- `applyFlushDecision(state, decision, entry, meta): { queue, failed, stop }` — pure reducer
- `FailedEntry = OutboxEntry & { status: number; error: string; failedAt: string }`

- [ ] **Step 1: Write the failing tests** for `classifyFlush`, covering the full table:

| Status | Method | Expected |
|---|---|---|
| `200`, `201`, `204` | any | `drop` |
| `404` | `DELETE` | `drop` |
| `404` | `PATCH` | `drop` |
| `404` | `POST` | `park` |
| `401` | any | `auth` |
| `0`, `408`, `429`, `500`, `503` | any | `retry` |
| `400`, `403`, `409`, `422` | any | `park` |

Then test `applyFlushDecision`: `drop` removes the head and continues; `park` removes the head, appends a `FailedEntry`, and continues; `retry` and `auth` leave the queue untouched and set `stop`.

`404` on `DELETE`/`PATCH` is `drop` because the row is already absent — that *is* the desired end state, and parking it would demand attention for something already true.

- [ ] **Step 2: Rewrite the `flushOutbox` loop**

Only `retry` and `auth` return early. `drop` and `park` both advance the head, which is what removes the jam at `flush.ts:47`. Extend `FlushResult` with `parked: number` alongside `flushed`.

- [ ] **Step 3: Add the failed store** — `FAILED_KEY = 'pat:failed'` in `cache.ts` with `getFailed()` / `setFailed()`, mirroring the outbox helpers.
- [ ] **Step 4: Verify** — `npm run test -w @pat/web` passes.
- [ ] **Step 5: Commit** — `fix(web): park dead outbox entries instead of jamming the queue`

---

### Task 8: Surface failed writes

**Files:**
- Modify: `apps/web/src/sync/SyncContext.tsx` (expose `failedCount`, `failedEntries`, `discardFailed`, `discardAllFailed`)
- Modify: `apps/web/src/components/SyncBanner.tsx`
- Modify: `apps/web/src/routes/Settings.tsx` (new section)
- Create: `apps/web/src/sync/describe-entry.ts`
- Test: `apps/web/src/sync/describe-entry.test.ts`, `apps/web/src/components/SyncBanner.test.tsx`

**Interfaces:**
- `describeEntry(entry: OutboxEntry): string` — Persian label derived from `method` + `path`

- [ ] **Step 1: Write the failing tests** for `describeEntry`:

| method + path | Label |
|---|---|
| `POST /people` | `افزودن نفر` |
| `PATCH /people/:id` | `ویرایش نفر` |
| `DELETE /people/:id` | `حذف نفر` |
| `POST /people/:id/balances` | `افزودن امانت` |
| `DELETE /balances/:id` | `حذف امانت` |
| `POST /balances/:id/transactions` | `افزودن تراکنش` |
| `PATCH /transactions/:id` | `ویرایش تراکنش` |
| `DELETE /transactions/:id` | `حذف تراکنش` |
| anything unmatched | `تغییر` |

- [ ] **Step 2: Banner precedence** — evaluate in this order, and test all four states:

| Condition | Message |
|---|---|
| `failedCount > 0` | `${n} تغییر ثبت نشد — تو تنظیمات ببین` |
| `!online` | `آفلاینی — تغییرات اینجا می‌مونه` |
| `pendingCount > 0` | `${n} تغییر در انتظار همگام‌سازی` |
| otherwise | renders nothing |

A failure needs attention more than a pending sync does, so it wins. Counts use `toLocaleString('fa-IR')`.

- [ ] **Step 3: Settings section** — a `settings-section` titled `تغییرات ثبت‌نشده`, rendered only when `failedEntries.length > 0`. One row per entry: `describeEntry(entry)`, its `failedAt` through `formatRelativeFa`, and a `پاک کن` button. A `همه رو پاک کن` `ConfirmPress` at the foot of the section.
- [ ] **Step 4: Verify** — `npm run test -w @pat/web` passes.
- [ ] **Step 5: Commit** — `feat(web): surface writes that failed to sync in Settings`

---

### Task 9: Logout data hygiene

**Files:**
- Modify: `apps/web/src/sync/cache.ts` (add `clearLocalData`)
- Modify: `apps/web/src/routes/Settings.tsx` (`handleLogout` at line 165, and the logout button)
- Modify: `apps/web/src/sync/SyncContext.tsx` (`forceLogin`)
- Test: `apps/web/src/routes/Settings.logout.test.tsx` (new)

**Interfaces:**
- `clearLocalData(): Promise<void>` — clears `pat:snapshot`, `pat:outbox`, `pat:failed`, `pat:session`

- [ ] **Step 1: Write the failing tests**
  - deliberate logout with an empty queue → `clearLocalData` ran, all four keys gone
  - deliberate logout with `pendingCount > 0` → the warning copy renders and nothing is cleared until confirmed
  - `forceLogin` → `pat:session` gone but `pat:outbox` and `pat:snapshot` intact

- [ ] **Step 2: Implement `clearLocalData`** in `cache.ts`, deleting all four keys from the `kv` store.

- [ ] **Step 3: Deliberate logout** — in `handleLogout`, `await api.logout()`, then `await clearLocalData()`, then navigate. When `pendingCount + failedCount > 0`, show the guard first:

> `${n} تغییر هنوز همگام نشده. خارج بشی پاک می‌شه.`

with a `ConfirmPress` labelled `خروج از حساب` / `به‌هرحال خارج شو`. When the queue is empty, the existing plain button is enough.

- [ ] **Step 4: Forced logout** — `forceLogin` in `SyncContext` calls `clearLocalSession()` only, never `clearLocalData()`. An expired cookie must not destroy unsynced work; those entries flush after the next login. Add that sentence as a comment so it is not "simplified" later.
- [ ] **Step 5: Verify** — `npm run test -w @pat/web` passes.
- [ ] **Step 6: Commit** — `feat(web): clear cached ledger on logout, keep it on session expiry`

---

### Task 10: iOS standalone, manifest id, and font subsets

**Files:**
- Modify: `apps/web/index.html`
- Modify: `apps/web/src/styles/global.css:1-3` (imports) and the `.app-shell` rule at line 19
- Modify: `apps/web/vite.config.ts` (manifest `id`)

- [ ] **Step 1: Apple meta and viewport** — add to `index.html`, exactly as in spec §8.1: `viewport-fit=cover`, `apple-mobile-web-app-capable`, `mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style` = `default`, `apple-mobile-web-app-title`, and `<link rel="apple-touch-icon" href="/icon-192.png">`.

`viewport-fit=cover` on its own makes the problem worse — it extends the page under the notch — so Step 2 ships in the same commit.

- [ ] **Step 2: Safe-area padding** — on `.app-shell`:

```css
padding-top: env(safe-area-inset-top);
padding-bottom: env(safe-area-inset-bottom);
padding-inline: env(safe-area-inset-left) env(safe-area-inset-right);
```

`global.css` has no `fixed` or `sticky` elements and `body` is already `height: 100dvh`, so nothing else needs insets. Verify with `grep -n 'position: fixed\|position: sticky' apps/web/src/styles/global.css` returning nothing.

- [ ] **Step 3: Manifest id** — add `id: '/'` to the `manifest` block in `vite.config.ts`. Without it the identity derives from `start_url`, so a later `start_url` change would orphan every existing install.
- [ ] **Step 4: Arabic font subsets** — replace the three imports at the top of `global.css` with `@fontsource/vazirmatn/arabic-400.css`, `@fontsource/vazirmatn/arabic-700.css`, `@fontsource/lalezar/arabic-400.css`. All three exist in `node_modules`.
- [ ] **Step 5: Verify** — `npm run build -w @pat/web`, then confirm `dist/assets` contains no `latin`, `latin-ext` or `vietnamese` woff2 files, and that `dist/manifest.webmanifest` contains `"id":"/"`.
- [ ] **Step 6: Commit** — `feat(web): fix iOS safe areas, add manifest id, ship Arabic subsets only`

---

### Task 11: Manifest screenshots

**Files:**
- Create: `apps/web/public/screenshots/screenshot-narrow.png` (1080×1920), `screenshot-wide.png` (1920×1080)
- Modify: `apps/web/vite.config.ts` (`manifest.screenshots`, `workbox.globIgnores`)

- [ ] **Step 1: Capture** against a locally seeded instance using **invented names only** — never real ledger data. The Home screen is the right frame for both.
- [ ] **Step 2: Declare** in the manifest with `form_factor: 'narrow'` and `'wide'` respectively, `type: 'image/png'`, and their sizes.
- [ ] **Step 3: Keep them out of the precache** — `globPatterns` includes `**/*.png`, so add `globIgnores: ['**/screenshots/**']`. Only the browser's install sheet ever fetches them; precaching them is pure install weight.
- [ ] **Step 4: Verify** — rebuild, confirm `dist/sw.js` lists no screenshot entry and `dist/manifest.webmanifest` lists both.
- [ ] **Step 5: Commit** — `feat(web): add manifest screenshots for the install sheet`

---

### Task 12: Full verification pass

- [ ] **Step 1: Automated** — `npm run test:all` and `npm run build -w @pat/web` both clean.
- [ ] **Step 2: Idempotency against local D1** — start `npm run dev:api`, then with `curl`:
  - `POST /api/people` with a chosen `id` → `201`, and the response carries that id
  - the **same** request again → `200` and the same row, not a duplicate and not a `500`
  - `POST /api/people` with `"id": "garbage"` → `201` with a server-minted UUID
  - `POST /api/people/<chosen-id>/balances` → succeeds, proving the offline add-person-then-add-balance flow
- [ ] **Step 3: Offline** — `npm run build -w @pat/web && npm run preview -w @pat/web`; in DevTools → Application → Offline, hard-reload `/`, `/settings`, and a `/balances/:id` deep link. Each must render from the snapshot rather than a spinner. This is the check that would have caught the original defect.
- [ ] **Step 4: Queue round trip** — offline, add a person and a balance for them; go online; confirm both flush, the banner clears, and nothing lands in `تغییرات ثبت‌نشده`.
- [ ] **Step 5: Install** — Lighthouse installability pass; install on a device and confirm the safe-area padding and the home-screen icon.
- [ ] **Step 6: Commit** any fixes found, then merge.
