# PWA Offline Correctness — Design

> **Status:** Approved (2026-08-02)
> **Depends on:** [Architecture & data design](./2026-07-30-personal-asset-custody-tracker-design.md) (Approved), [Two-factor auth](./2026-07-31-two-factor-auth-design.md) (Approved)
> **Scope:** Make the installed app actually work offline; stop losing and stalling queued writes; finish the install story on iOS and Android
> **Out:** Runtime caching of `/api`, Background Sync, push notifications, multi-device conflict resolution, changing the update strategy

---

## 1. Why

The app already contains a complete offline architecture — an IndexedDB snapshot (`apps/web/src/sync/cache.ts`), an outbox queue (`sync/outbox.ts`, `sync/flush.ts`), online/offline listeners and a `SyncBanner`. A service worker registers correctly, precaches the shell, and serves `index.html` as a navigation fallback with `/api` denylisted, so deep links resolve offline.

**None of it is reachable.** `apps/web/src/auth/AuthGate.tsx:17` calls `api.status()` with a `.then()` and no `.catch()`. Offline, `fetch` rejects, the promise never settles the state, and the app sits on «در حال بارگذاری…» forever. `apps/web/src/routes/Login.tsx:31` has the identical bug. Opening the installed app without a network shows a permanent spinner and nothing else.

Two further defects sit behind that one, and would surface the moment it is fixed:

- **Writes are lost on a reachable-looking network.** `SyncContext.mutate` (`sync/SyncContext.tsx:105`) only queues when `navigator.onLine === false`. A captive portal, a downed Worker, or a flaky signal leaves `onLine === true`; `fetch` throws; the change is gone.
- **The queue jams permanently.** `flushOutbox` (`sync/flush.ts:47`) returns on any non-`401` failure *without removing the head entry*. One entry that can never succeed blocks every later change forever, while the banner shows only «N تغییر در انتظار».

The jam is easy to trigger through normal use. Offline, routes mint a client-side `crypto.randomUUID()` for the optimistic snapshot, but the queued `POST` does not carry it, so the server mints a different ID. Adding a person offline and immediately recording what they handed you sends `POST /people/<client-uuid>/balances` — a person the server has never seen — which `404`s on flush and jams the queue.

This passes the [PRD](../../PRD.md) §27 test. It adds no feature and no screen. It makes an already-built capability, which the product claims by being installable, actually function.

## 2. Locked decisions

| Topic | Decision |
|---|---|
| Offline open | **Optimistic unlock, full read/write.** A local marker grants access; the server stays authoritative and a `401` still forces login |
| Optimistic UI trigger | `mutate()` returns `{ queued }`; the 8 route blocks switch from `if (!online)` to `if (result.queued)` |
| Failed writes | Parked in a separate list and surfaced in Settings — never silently dropped |
| Row IDs | **Client mints the UUID; the server accepts it.** Makes `POST` idempotent |
| Logout | Clears marker + snapshot + outbox + failed list, behind a guard when work is unsynced |
| Forced logout (`401`) | Clears the marker **only** — an expired cookie must not destroy unsynced work |
| Update strategy | **Unchanged.** `registerType: 'autoUpdate'` stays; see §8 |
| Maskable icon | **Unchanged.** Verified correct; see §8 |
| Fonts | Arabic subsets only |
| API surface | One additive change: optional `id` in create bodies. No migration, no new endpoint |

## 3. Architecture

Three layers change, each with a pure, unit-testable core:

```
apps/web/src/api/client.ts          fetch rejection → { ok: false, status: 0 }   (sentinel, not an exception)
  → apps/web/src/auth/local-session.ts   isSessionValid                          (pure)
    → apps/web/src/auth/AuthGate.tsx     offline decision table
  → apps/web/src/sync/flush-policy.ts    classifyFlush                           (pure)
    → apps/web/src/sync/flush.ts         drain loop
      → apps/web/src/sync/SyncContext.tsx  mutate / failed list
        → routes, SyncBanner, Settings
packages/domain/src/session.ts      SESSION_TTL_MS                               (shared constant)
apps/api/src/routes/{people,balances}.ts  accept a client-supplied id
```

Rejected alternatives:

- **Runtime-cache `/api` GETs in Workbox.** The IndexedDB snapshot is already the offline store. A second cache layer would serve stale JSON that disagrees with the snapshot, with no way to reconcile them.
- **Centralise optimistic writes into a snapshot reducer.** Cleaner in the abstract, but it is a refactor of all 8 mutation shapes stacked on top of the bug fixes. The `{ queued }` return value fixes the correctness problem with a diff that can actually be reviewed.
- **Read-only offline.** Would make the existing outbox dead code. Recording a hand-off that just happened is the main reason to open this app without a signal.

## 4. Offline auth

### 4.1 Network failure as a value

`authFetch` and `apiFetch` in `apps/web/src/api/client.ts` wrap their `fetch` call:

```ts
let res: Response
try {
  res = await fetch(...)
} catch {
  return { ok: false, status: 0, error: 'offline' }
}
```

`status: 0` is the sentinel for "the request never reached the server". Every call site inherits the fix. `'offline'` joins `API_ERROR_MESSAGES` as «ارتباط با سرور برقرار نشد.».

### 4.2 Local session marker

New `apps/web/src/auth/local-session.ts`, stored in the existing IndexedDB `kv` store under key `pat:session`:

```ts
export type LocalSession = { expiresAt: string }          // ISO 8601

export function isSessionValid(
  session: LocalSession | undefined,
  now: Date,
): boolean

export function getLocalSession(): Promise<LocalSession | undefined>
export function setLocalSession(now: Date): Promise<void>   // expiresAt = now + SESSION_TTL_MS
export function clearLocalSession(): Promise<void>
```

`SESSION_TTL_MS` (30 days) moves to `packages/domain/src/session.ts` and is imported by both `apps/api/src/auth.ts` and the web app, so the two cannot drift.

The marker is written on successful login and setup, refreshed whenever the server confirms `authenticated`, and cleared on logout and on any server `401`. It is not a credential — it holds no token and grants nothing to the server. It records only that this device was signed in recently, so the UI can decide what to render while the server is unreachable.

### 4.3 AuthGate decision table

| `api.status()` result | Local marker | Rendered |
|---|---|---|
| `authenticated` | — | app; refresh marker |
| `unauthenticated` or `setupRequired` | — | clear marker; redirect `/login` |
| `status: 0` | valid | app, in offline mode |
| `status: 0` | missing or expired | `offline-locked` screen |

`offline-locked` is a new screen — «آفلاینی — برای ورود باید به اینترنت وصل بشی» with a retry button. It is deliberately not a redirect to `/login`, because `/login` cannot authenticate anyone without a network.

`Login.tsx` gains the same `status: 0` branch, showing an inline offline notice instead of its permanent spinner.

**Also fixed here:** `AuthGate`'s effect depends on `location.pathname`, so it issues a `/api/auth/status` round trip on every navigation. With offline handling added, a flaky link would make the app flicker between online and offline modes as you move between screens. It becomes a check on mount plus a re-check on `visibilitychange` when the document returns to the foreground.

## 5. The write path

### 5.1 Client-minted IDs

Routes generate the UUID **before** calling `mutate` and pass it in the request body. On the server, the four `crypto.randomUUID()` sites — `apps/api/src/routes/people.ts:186` and `apps/api/src/routes/balances.ts:227,228,335` — accept an `id` from the body when it is a well-formed UUID, and mint their own otherwise.

The payoff is larger than the flow that motivated it. **`POST` becomes idempotent:** a retried create whose ID already exists returns the existing row with `200` rather than duplicating it. `PATCH` and `DELETE` address rows by ID and are already idempotent. That is what makes it safe to queue and retry an *ambiguous* failure — one where the request may or may not have reached the server — without risking a double-posted transaction. Without it, retrying on a network rejection would be a data-integrity hazard in a money ledger.

### 5.2 `mutate()` classification

```ts
export type MutateResult = { queued: boolean }
```

| Outcome | Action |
|---|---|
| `navigator.onLine === false` | enqueue → `{ queued: true }` |
| `fetch` rejects | enqueue → `{ queued: true }` |
| `408`, `429`, `5xx` | enqueue → `{ queued: true }` |
| `401` | clear marker, force login |
| other `4xx` | `throw new MutateError(code)` — a genuine validation error, shown immediately |
| `2xx` | `refresh()` → `{ queued: false }` |

The 8 optimistic-write blocks in `Home.tsx` (1), `Person.tsx` (2) and `Balance.tsx` (5) change their condition from `if (!online)` to `if (result.queued)`. An unreachable server now behaves exactly like a dropped connection, in the queue and on screen alike.

## 6. Outbox drain and failed writes

### 6.1 Flush classification

New pure module `apps/web/src/sync/flush-policy.ts`:

```ts
export type FlushDecision = 'drop' | 'retry' | 'park' | 'auth'

export function classifyFlush(status: number, method: string): FlushDecision
```

| Status | Decision | Rationale |
|---|---|---|
| `2xx` | `drop` | applied |
| `404` on `DELETE` or `PATCH` | `drop` | already absent — the desired end state |
| `401` | `auth` | stop the drain, force login |
| `0`, `408`, `429`, `5xx` | `retry` | keep the head, try again later |
| any other `4xx` | `park` | will never succeed; set aside and keep draining |

In the rewritten `flushOutbox` loop, only `retry` and `auth` stop the drain. `drop` and `park` both advance it, which is what removes the jam.

### 6.2 The failed list

A third IndexedDB key, `pat:failed`:

```ts
export type FailedEntry = OutboxEntry & {
  status: number
  error: string
  failedAt: string      // ISO 8601
}
```

`SyncContext` exposes `failedCount`, `failedEntries`, `discardFailed(id)` and `discardAllFailed()` alongside the existing outbox API.

Settings gains a «تغییرات ثبت‌نشده» section, rendered only when the list is non-empty. Each row describes the change in Persian, derived from its `method` and `path` (for example `POST /balances/:id/transactions` → «افزودن تراکنش»), with a discard button, plus a discard-all action.

`SyncBanner` gains a third state, so a failure is not invisible until you happen to open Settings:

| Condition | Message |
|---|---|
| `failedCount > 0` | «N تغییر ثبت نشد — تو تنظیمات ببین» |
| offline | «آفلاینی — تغییرات اینجا می‌مونه» |
| `pendingCount > 0` | «N تغییر در انتظار همگام‌سازی» |

Evaluated in that order: a failure needs attention more than a pending sync does.

## 7. Logout and data hygiene

`clearLocalData()` in `sync/cache.ts` clears all four keys: `pat:snapshot`, `pat:outbox`, `pat:failed`, `pat:session`. The service worker precache is untouched — it holds shell code only, never data — so re-login stays instant.

Two paths, and the distinction is the point:

- **Deliberate logout** (the Settings button, `Settings.tsx:167`) calls `clearLocalData()`. When `pendingCount + failedCount > 0`, a `ConfirmPress` guard comes first: «N تغییر هنوز همگام نشده. خارج بشی پاک می‌شه.» with «اول همگام کن» and «به‌هرحال خارج شو».
- **Forced logout** (a server `401` through `forceLogin`) clears `pat:session` only. An expired cookie is not a reason to destroy unsynced work; those entries flush after the next login.

## 8. Install quality

### 8.1 iOS standalone

`apps/web/index.html` carries no Apple meta at all, so an installed iPhone draws content under the notch and the home indicator.

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="default" />
<meta name="apple-mobile-web-app-title" content="امانت‌ها" />
<link rel="apple-touch-icon" href="/icon-192.png" />
```

`viewport-fit=cover` on its own makes the problem *worse* by extending the page into the inset area, so it ships together with the padding. `global.css` has no `fixed` or `sticky` elements and `body` is already `height: 100dvh`, so one rule covers it:

```css
.app-shell {
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
  padding-inline: env(safe-area-inset-left) env(safe-area-inset-right);
}
```

`status-bar-style: default` rather than `black-translucent`: the cream background reads correctly under a light status bar, and it avoids the translucent-mode layout trap.

### 8.2 Manifest

`id: '/'` is added. Without it, the app identity is derived from `start_url`, so a later change to `start_url` would orphan every existing install.

`screenshots` is added with two entries, captured from a locally seeded instance using invented names — never real ledger data:

| File | Size | `form_factor` |
|---|---|---|
| `screenshot-narrow.png` | 1080×1920 | `narrow` |
| `screenshot-wide.png` | 1920×1080 | `wide` |

`globPatterns` includes `**/*.png`, which would precache both. Only the browser's install sheet ever fetches them, so they go in `globIgnores`.

### 8.3 Fonts

`global.css` imports `@fontsource/vazirmatn/400.css`, which pulls every subset — arabic, latin, latin-ext, vietnamese — and `globPatterns: ['**/*.woff2']` precaches all of them. It switches to the Arabic subsets:

```css
@import '@fontsource/vazirmatn/arabic-400.css';
@import '@fontsource/vazirmatn/arabic-700.css';
@import '@fontsource/lalezar/arabic-400.css';
```

All three files exist in `node_modules`. Five woff2 files leave the precache, roughly 60 KB off the install. The stack is already `Vazirmatn, Tahoma, sans-serif` (`global.css:8`), so a name typed in English renders in Tahoma — legible and unremarkable, and the right trade for a Persian-only UI.

### 8.4 Deliberately unchanged

- **Update strategy.** `registerType: 'autoUpdate'` with `skipWaiting`/`clientsClaim` stays. Recorded risk: a deploy landing while a transaction form is open discards what has been typed. The outbox is unaffected — it lives in IndexedDB and survives the reload. Acceptable for a single-user app that is deployed rarely.
- **Maskable icon.** Initially flagged as reusing the plain 512 icon. Inspection of the pixels disproved it: `icon-512.png` is fully opaque, its cream background bleeds edge to edge, and both the teal card and the dot sit well inside the 80% maskable safe zone. Only the decorative ruled lines are clipped, which is what they are for. No change.

## 9. Verification

Pure logic carries most of the risk and is unit-tested:

- `isSessionValid` — valid, expired, missing, boundary
- `classifyFlush` — the full status table, including `404`-on-`DELETE` → `drop`
- failed-list transitions as a pure reducer over `(queue, failed, decision)`

Component tests, with `fetch` mocked to reject:

- `AuthGate` — all three offline branches: valid marker renders the app, expired marker renders `offline-locked`, a server `unauthenticated` redirects to `/login`
- `Login` — offline notice in place of the spinner
- the existing route tests extended so a `queued: true` result still writes the optimistic snapshot

API tests:

- `POST` honours a supplied UUID
- `POST` with a **duplicate** ID returns the existing row and `200` — the idempotency guarantee §5.1 depends on
- `POST` with a malformed ID falls back to a server-minted one

Manual, against a production build:

- DevTools → Application → Offline, then hard-reload every route including deep links. This is the check that would have caught the original defect.
- Install on Android and iOS; confirm safe-area padding and the home-screen icon.
- Lighthouse installability pass.

## 10. Out of scope

Runtime caching of `/api` responses; Periodic Background Sync; push notifications; multi-device conflict resolution. This is a single-user app with last-write-wins, and that remains true.
