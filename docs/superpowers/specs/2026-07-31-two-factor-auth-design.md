# Two-Factor Authentication (TOTP) — Design

> **Status:** Approved (2026-07-31)
> **Depends on:** existing password auth (`apps/api/src/auth.ts`, `apps/api/src/routes/auth.ts`)
> **Scope:** TOTP second factor alongside the existing password, attempt throttling on both factors, a CLI reset command, enrollment UI
> **Out:** Recovery codes; WebAuthn/passkeys; email or SMS codes; multi-user accounts; escalating backoff; encrypting the TOTP seed at rest

---

## 1. Problem

The app is protected by a single password (`settings.password_hash`, PBKDF2-SHA256) and a 30-day HMAC session cookie. It holds records of money held in custody for other people, so a leaked or guessed password is the whole security boundary. There is also **no attempt throttling anywhere** in the API — verified by grep for rate/attempt/throttle/lockout across `apps/api/src`.

---

## 2. Locked decisions

| Topic | Decision |
|---|---|
| Second factor | **TOTP** (RFC 6238) via an authenticator app |
| Algorithm | HMAC-**SHA1**, 6 digits, 30s period — maximum authenticator compatibility |
| Clock skew | Accept steps `now-1`, `now`, `now+1` |
| Replay | Reject any step **≤** the last successfully used step |
| Recovery codes | **Not built.** Recovery is a CLI command run from the dev machine |
| Throttling | In scope, on **both** the password and the code step |
| Backoff shape | Fixed: 5 failures → 15-minute lock. No escalation |
| Enrollment secret | QR code **and** the base32 secret for manual entry |
| QR rendering | Client-side via `qrcode.react` |
| Seed at rest | Stored plaintext — see §3.2 for why encryption is not worth it |
| Pre-auth disclosure | `/status` never reveals whether 2FA is on; `/login` signals it only after the password is correct |
| Re-auth for changes | Enroll and disable both require the password again, despite a valid session |
| Password change | Requires a valid code while 2FA is enabled |
| Dead code | Delete the unreferenced `apps/web/src/pages/LoginPage.tsx` |

---

## 3. Data model

### 3.1 TOTP config — no schema change

The existing `settings` table is `key TEXT PRIMARY KEY, value TEXT NOT NULL`, so TOTP needs **no migration**:

| Key | Meaning |
|---|---|
| `totp_pending_secret` | base32 secret written at enrollment, before the first code confirms it |
| `totp_secret` | confirmed base32 secret. **Presence of this key is the definition of "2FA enabled."** |
| `totp_last_step` | decimal string of the last successfully consumed time step; blocks replay |

`totp_pending_secret` is deleted when enrollment is confirmed or restarted. There is no separate `enabled` flag to drift out of sync.

### 3.2 Why the seed is not encrypted

Encrypting `totp_secret` with `SESSION_SECRET` was considered and rejected. The only adversary it defends against is one who can read D1 but not the Worker's secrets — and in this deployment anyone with that Cloudflare account can read `SESSION_SECRET` and simply mint a valid session cookie, bypassing both factors. The complexity buys no real resistance.

### 3.3 Throttle state — migration `0002_auth_throttle.sql`

Attempt counters are mutable runtime state with a different lifecycle from configuration, and mixing them into `settings` would make the reset command's job ambiguous. They get their own table:

```sql
CREATE TABLE auth_throttle (
  id           TEXT PRIMARY KEY,
  failed_count INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT
);
```

Exactly one row, `id = 'global'` — the app is single-user. `locked_until` is an ISO-8601 string or `NULL`. The row is created on demand by the first failure.

---

## 4. TOTP module — `apps/api/src/totp.ts`

Pure functions, Web Crypto only, **time injected** so tests are deterministic (matching how `signSession(secret, nowMs)` already works).

```ts
export const TOTP_DIGITS = 6
export const TOTP_PERIOD_SECONDS = 30
export const TOTP_SKEW_STEPS = 1

export function generateSecret(): string
export function base32Encode(bytes: Uint8Array): string
export function base32Decode(value: string): Uint8Array | null
export function stepForTime(nowMs: number): number
export function totpCode(secret: string, step: number): Promise<string>
export function otpauthUri(secret: string): string

export function verifyTotp(
  secret: string,
  code: string,
  nowMs: number,
  lastStep: number,
): Promise<{ valid: boolean; step: number }>
```

**`generateSecret`** — 20 random bytes from `crypto.getRandomValues`, base32-encoded (RFC 4648 alphabet `A-Z2-7`, uppercase, **no padding**; authenticators accept unpadded).

**`totpCode`** — HMAC-SHA1 over the 8-byte big-endian step counter, then RFC 4226 dynamic truncation: offset = low nibble of the last byte, take 4 bytes at that offset, mask the high bit, `mod 10^6`, zero-pad to 6 characters.

**`verifyTotp`** — normalizes the input (strips spaces, converts Persian/Arabic-Indic digits to Latin so a code typed on a Persian keypad still works), then tests steps `now-1 … now+1`. On success returns `{ valid: true, step }` with the matched step so the caller can persist it as `totp_last_step`; on failure returns `{ valid: false, step: -1 }`. **Any candidate step ≤ `lastStep` is skipped**, which prevents replaying a code that is still inside its own validity window. Comparison against each candidate is length-checked then constant-time over the digit string.

Callers pass `lastStep = -1` when no step has been consumed yet (fresh enrollment), since step `0` is a legitimate value.

**`otpauthUri`** — `otpauth://totp/Amanatha:owner?secret=<base32>&issuer=Amanatha&algorithm=SHA1&digits=6&period=30`. The issuer is the Latin transliteration rather than «امانت‌ها» because authenticator apps render and sort ASCII labels reliably; the account is the fixed string `owner` since there is only ever one.

---

## 5. Throttle module — `apps/api/src/throttle.ts`

```ts
export const MAX_FAILURES = 5
export const LOCK_DURATION_MS = 15 * 60 * 1000

export function checkThrottle(
  db: D1Database,
  nowMs: number,
): Promise<{ locked: boolean; retryAfterSeconds: number }>

export function recordFailure(db: D1Database, nowMs: number): Promise<void>
export function resetThrottle(db: D1Database): Promise<void>
```

- `checkThrottle` — reads the `global` row; locked when `locked_until > now`. `retryAfterSeconds` is the whole seconds remaining, rounded up. An expired lock reports unlocked.
- `recordFailure` — upserts the row incrementing `failed_count`. On reaching `MAX_FAILURES` it sets `locked_until = now + LOCK_DURATION_MS` and resets `failed_count` to `0`, so the next lock needs another five failures rather than triggering on every subsequent attempt.
- `resetThrottle` — clears `failed_count` and `locked_until` after any successful login.

Every login attempt costs one D1 read and at most one write. Acceptable for single-user traffic.

---

## 6. API surface

### 6.1 `POST /api/auth/login` — `{ password, code? }`

```
1. checkThrottle locked        → 429 { error: 'too_many_attempts', retryAfterSeconds }
2. no password hash stored     → 401 { error: 'setup_required' }
3. password missing/wrong      → recordFailure → 401 { error: 'invalid_credentials' }
4. no totp_secret              → session cookie, resetThrottle → 200 { ok: true }
5. totp_secret set, no code    → 401 { error: 'totp_required' }        (no failure recorded)
6. code invalid                → recordFailure → 401 { error: 'invalid_code' }
7. success                     → save totp_last_step, session cookie,
                                 resetThrottle → 200 { ok: true }
```

Step 5 is deliberate: the client discovers that a second factor exists only *after* proving the password, so `GET /auth/status` stays free of pre-auth disclosure. It is not counted as a failure because the password was correct — counting it would let a correct-password user lock themselves out just by submitting the form once.

### 6.2 New endpoints — all behind `requireAuth`

| Method | Path | Body | Response / behavior |
|---|---|---|---|
| GET | `/api/auth/totp` | — | `{ enabled: boolean }` |
| POST | `/api/auth/totp/enroll` | `{ password }` | `409 already_enabled` if `totp_secret` exists. Verifies password, writes `totp_pending_secret`, returns `{ secret, otpauthUri }` |
| POST | `/api/auth/totp/confirm` | `{ code }` | `409 not_pending` with no pending secret. On a valid code: promote pending → `totp_secret`, delete pending, set `totp_last_step`, return `{ ok: true }`. Invalid → `401 invalid_code` |
| POST | `/api/auth/totp/disable` | `{ password, code }` | `409 not_enabled` if off. Requires **both** valid. Deletes `totp_secret` and `totp_last_step`, returns `{ ok: true }` |

Enroll and disable re-verify the password even though `requireAuth` already passed: with a 30-day cookie, a valid session is weak evidence that the person at the keyboard is the owner. Enroll refuses to overwrite an active secret so a stale enrollment screen cannot silently replace a working authenticator — disable first.

Throttling is **not** applied to `/confirm`: it sits behind `requireAuth` and an authenticated owner mistyping their own enrollment code should not be locked out. `/disable` also skips it for the same reason.

### 6.3 Changed — `POST /api/auth/password`

Body gains an optional `code`. When `totp_secret` is set, a valid code is required alongside `currentPassword`; without it, `401 code_required`, and on mismatch `401 invalid_code`. Prevents someone with a hijacked session and the current password from taking over the login.

### 6.4 `GET /api/auth/status` — unchanged

Still `{ setupRequired, authenticated }`. No `totpEnabled` field, so nothing leaks pre-auth. `AuthGate` keeps working untouched; Settings uses `GET /api/auth/totp` instead.

---

## 7. Reset command

```bash
npm run 2fa:reset               # local D1  (default)
npm run 2fa:reset -- --remote   # production, requires typed confirmation
```

`scripts/reset-2fa.sh`, wired as a root `package.json` script.

Clears, in one invocation:
- `settings` rows `totp_secret`, `totp_pending_secret`, `totp_last_step`
- the `auth_throttle` row

The throttle row is included on purpose: someone locked out of 2FA has very likely also tripped the attempt lock, and needing to discover a second command at that moment would be its own trap.

**Safety:** defaults to `--local` so a stray run cannot touch production. `--remote` prints the target and requires typing `RESET` before proceeding. Idempotent — safe to run when 2FA is already off. Prints what it cleared. Exits non-zero on an unknown flag rather than silently defaulting.

---

## 8. Web UI

### 8.1 `routes/Login.tsx`

Add a `code` field, hidden until the API answers `totp_required`:

- On `totp_required`: reveal the field, keep the typed password, focus the code input, show no error (this is a normal step, not a failure).
- Field: `inputMode="numeric"`, `dir="ltr"`, max 6 digits, digits-only — reuses `toLatinDigits` from `src/format/digits.ts` so Persian numerals typed on a Persian keypad are accepted.
- Submitting sends `{ password, code }` together.

New copy in `ERROR_MESSAGES`:

| Code | Persian |
|---|---|
| `invalid_code` | `کد اشتباهه.` |
| `too_many_attempts` | `تلاش زیاد بود. چند دقیقه دیگه امتحان کن.` |
| `code_required` | `کد دو مرحله‌ای رو وارد کن.` |

### 8.2 `components/TotpEnroll.tsx` (new)

The enrollment wizard, kept out of `Settings.tsx` (already ~200 lines) so neither file does two jobs. Three internal steps:

1. **Password** — confirms identity, calls `enroll`.
2. **Scan** — `qrcode.react` renders the `otpauthUri` as SVG, with the base32 secret shown below in space-separated groups of four for manual entry.
3. **Confirm** — 6-digit field; calls `confirm`. On success invokes `onEnabled()` so Settings refreshes.

Cancelling at any step just closes; the pending secret is harmless and is overwritten by the next enrollment.

### 8.3 `routes/Settings.tsx`

A «ورود دو مرحله‌ای» section above the backup section:

- **Off:** short explainer + «فعال کردن» button, which mounts `TotpEnroll`.
- **On:** «فعاله» status + «غیرفعال کردن» revealing password + code fields, submitted via the existing two-tap `ConfirmPress`.

Reads state from `GET /api/auth/totp` on mount.

### 8.4 `api/client.ts`

```ts
login: (password: string, code?: string) => …          // code added
totpStatus: () => …                                    // GET  /auth/totp
totpEnroll: (password: string) => …                    // POST /auth/totp/enroll
totpConfirm: (code: string) => …                       // POST /auth/totp/confirm
totpDisable: (password: string, code: string) => …     // POST /auth/totp/disable
changePassword: (current, next, code?) => …            // code added
```

### 8.5 Delete `apps/web/src/pages/LoginPage.tsx`

Unreferenced (grep finds only its own declaration). This work touches login, so it goes now rather than rotting further.

---

## 9. Testing

API tests live in `apps/api/tests/*.test.ts`, vitest, `environment: "node"`, testing crypto helpers directly with injected time.

### 9.1 `apps/api/tests/totp.test.ts`

Anchored on the **official RFC 6238 Appendix B vectors** for SHA-1 with `K = "12345678901234567890"` (20 ASCII bytes), truncated to 6 digits:

| Unix time | Step | 8-digit vector | Expected 6-digit |
|---|---|---|---|
| 59 | 1 | 94287082 | `287082` |
| 1111111109 | 37037036 | 07081804 | `081804` |
| 1111111111 | 37037037 | 14050471 | `050471` |
| 1234567890 | 41152263 | 89005924 | `005924` |
| 2000000000 | 66666666 | 69279037 | `279037` |
| 20000000000 | 666666666 | 65353130 | `353130` |

Plus:
- `base32Encode`/`base32Decode` round-trip; `base32Decode` returns `null` on invalid input.
- `generateSecret` yields 32 base32 chars (20 bytes) and differs across calls.
- Skew: a code from step `n` verifies at steps `n-1`, `n`, `n+1` and fails at `n±2`.
- Replay: a code at step `n` fails when `lastStep = n`, and also when `lastStep > n`.
- Persian digits: `«۲۸۷۰۸۲»` verifies identically to `"287082"`.
- Whitespace: `"287 082"` verifies.
- `otpauthUri` contains the secret, `algorithm=SHA1`, `digits=6`, `period=30`.

### 9.2 `apps/api/tests/throttle.test.ts`

Uses an in-memory fake `D1Database` implementing the `prepare().bind().first()/run()` surface the module uses — the existing suite has no D1 harness, so this fake is part of the work.

- Four failures leave it unlocked; the fifth locks it.
- `retryAfterSeconds` is positive inside the window and the lock reports unlocked once `nowMs` passes `locked_until`.
- `resetThrottle` clears both fields.
- `failed_count` resets to 0 when the lock is applied.

### 9.3 Web

- `Login.test.tsx` — the code field is absent initially, appears after a `totp_required` response, the password is preserved, and submitting sends both values; `too_many_attempts` renders its message.
- `TotpEnroll.test.tsx` — advances password → scan → confirm; renders the secret; `onEnabled` fires on success; a bad code shows an error and stays on the confirm step.
- Mocks follow the established pattern (`vi.hoisted` + `vi.mock`) and plain vitest matchers, since there is no jest-dom setup file.

### 9.4 Manual verification

Enroll with a real authenticator against local dev, log out, log in with password + code, confirm a wrong code is rejected, confirm the sixth wrong code locks for 15 minutes, then confirm `npm run 2fa:reset` restores access.

---

## 10. Out of scope

- Recovery codes (explicitly replaced by the CLI reset command).
- WebAuthn/passkeys; email or SMS delivery.
- Escalating or per-IP backoff; CAPTCHA.
- Trusted-device / "remember this browser" exemptions — the 30-day session already makes prompts rare.
- Encrypting the TOTP seed at rest (§3.2).
- Multi-user accounts or per-user secrets.
