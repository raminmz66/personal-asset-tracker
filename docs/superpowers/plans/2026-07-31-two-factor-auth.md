# Two-Factor Authentication (TOTP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a TOTP second factor beside the existing password, throttle login attempts on both factors, and provide a CLI command to reset 2FA when the authenticator is lost.

**Architecture:** Two new pure-function modules in the Worker (`totp.ts`, `throttle.ts`) carry all the logic and are unit-tested with injected time — `totp.ts` against the official RFC 6238 vectors. The auth routes compose them; no new state beyond three `settings` keys and one small table. The web side adds a conditionally-revealed code field on login and an enrollment wizard kept in its own component.

**Tech Stack:** Cloudflare Workers (Web Crypto: HMAC-SHA1), Hono, D1, React 19, react-router 7, vitest.

**Spec:** [`docs/superpowers/specs/2026-07-31-two-factor-auth-design.md`](../specs/2026-07-31-two-factor-auth-design.md)

## Global Constraints

- API commands run from `apps/api/`; web commands from `apps/web/`; script/deploy commands from the repo root. **Always `cd` explicitly** — a previous `cd` persisting into a `vitest` call makes it pick up the wrong config and fail with `document is not defined`.
- API tests: `apps/api/tests/*.test.ts`, `environment: "node"`, pure functions with **injected time** (see `signSession(secret, nowMs)` in `apps/api/tests/auth.test.ts`). Baseline: **4 tests**.
- Web tests: `apps/web/src/**/*.test.tsx`, jsdom, **no setup file** — so `@testing-library/jest-dom` matchers are unavailable. Use `toBeTruthy()` / `toBe()`. Baseline: **64 tests**.
- TOTP parameters are fixed: **HMAC-SHA1, 6 digits, 30s period, ±1 step skew**. Do not "improve" to SHA-256 — authenticator support is inconsistent.
- **JS bitwise operators coerce to int32.** When packing the 8-byte TOTP counter, use `% 256` and `Math.floor(n / 256)`, never `& 0xff` / `>>`, or large step values corrupt silently.
- `settings` is `key TEXT PRIMARY KEY, value TEXT NOT NULL` — every value is a string; convert on read.
- **`totp_secret` present ⇒ 2FA enabled.** There is no separate boolean.
- `lastStep = -1` means "no step consumed yet"; step `0` is legitimate.
- Persian copy, informal voice, matching the existing app.
- All font sizes in `global.css` must reference a `var(--text-*)` token — `grep -c 'font-size:\s*[0-9]' src/styles/global.css` must stay `0`.
- Commit after every task.

---

### Task 1: TOTP module

**Files:**
- Create: `apps/api/src/totp.ts`
- Create: `apps/api/tests/totp.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `TOTP_DIGITS = 6`, `TOTP_PERIOD_SECONDS = 30`, `TOTP_SKEW_STEPS = 1`
  - `generateSecret(): string`
  - `base32Encode(bytes: Uint8Array): string`
  - `base32Decode(value: string): Uint8Array | null`
  - `stepForTime(nowMs: number): number`
  - `totpCode(secret: string, step: number): Promise<string>`
  - `otpauthUri(secret: string): string`
  - `verifyTotp(secret, code, nowMs, lastStep): Promise<{ valid: boolean; step: number }>`

- [ ] **Step 1: Write the failing test**

Create `apps/api/tests/totp.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  base32Decode,
  base32Encode,
  generateSecret,
  otpauthUri,
  stepForTime,
  totpCode,
  verifyTotp,
} from "../src/totp";

/** RFC 6238 Appendix B test key: ASCII "12345678901234567890". */
const RFC_SECRET = base32Encode(
  new TextEncoder().encode("12345678901234567890"),
);

describe("base32", () => {
  it("round-trips bytes", () => {
    const bytes = new Uint8Array([0, 1, 2, 253, 254, 255]);
    expect(base32Decode(base32Encode(bytes))).toEqual(bytes);
  });

  it("encodes the RFC key to a known base32 string", () => {
    expect(RFC_SECRET).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  });

  it("ignores spaces and lowercase", () => {
    expect(base32Decode("gezd gnbv")).toEqual(base32Decode("GEZDGNBV"));
  });

  it("returns null for invalid input", () => {
    expect(base32Decode("!!!!")).toBeNull();
    expect(base32Decode("")).toBeNull();
    expect(base32Decode("ABC1")).toBeNull(); // 1 is not in the alphabet
  });
});

describe("stepForTime", () => {
  it("matches the RFC 6238 counters", () => {
    expect(stepForTime(59 * 1000)).toBe(1);
    expect(stepForTime(1111111109 * 1000)).toBe(37037036);
    expect(stepForTime(1111111111 * 1000)).toBe(37037037);
    expect(stepForTime(1234567890 * 1000)).toBe(41152263);
    expect(stepForTime(2000000000 * 1000)).toBe(66666666);
    expect(stepForTime(20000000000 * 1000)).toBe(666666666);
  });
});

describe("totpCode — RFC 6238 Appendix B vectors (SHA-1, 6 digits)", () => {
  const vectors: Array<[number, string]> = [
    [1, "287082"],
    [37037036, "081804"],
    [37037037, "050471"],
    [41152263, "005924"],
    [66666666, "279037"],
    [666666666, "353130"],
  ];

  for (const [step, expected] of vectors) {
    it(`step ${step} → ${expected}`, async () => {
      expect(await totpCode(RFC_SECRET, step)).toBe(expected);
    });
  }
});

describe("generateSecret", () => {
  it("produces 32 base32 chars (20 bytes) and varies", () => {
    const a = generateSecret();
    const b = generateSecret();
    expect(a).toMatch(/^[A-Z2-7]{32}$/);
    expect(a).not.toBe(b);
    expect(base32Decode(a)!.length).toBe(20);
  });
});

describe("verifyTotp", () => {
  const at = (step: number) => step * 30 * 1000;

  it("accepts the current step", async () => {
    const code = await totpCode(RFC_SECRET, 1000);
    expect(await verifyTotp(RFC_SECRET, code, at(1000), -1)).toEqual({
      valid: true,
      step: 1000,
    });
  });

  it("tolerates one step of clock skew either way", async () => {
    const code = await totpCode(RFC_SECRET, 1000);
    expect((await verifyTotp(RFC_SECRET, code, at(1001), -1)).valid).toBe(true);
    expect((await verifyTotp(RFC_SECRET, code, at(999), -1)).valid).toBe(true);
  });

  it("rejects two steps of skew", async () => {
    const code = await totpCode(RFC_SECRET, 1000);
    expect((await verifyTotp(RFC_SECRET, code, at(1002), -1)).valid).toBe(false);
    expect((await verifyTotp(RFC_SECRET, code, at(998), -1)).valid).toBe(false);
  });

  it("rejects a replayed step", async () => {
    const code = await totpCode(RFC_SECRET, 1000);
    expect((await verifyTotp(RFC_SECRET, code, at(1000), 1000)).valid).toBe(
      false,
    );
    expect((await verifyTotp(RFC_SECRET, code, at(1000), 1001)).valid).toBe(
      false,
    );
  });

  it("returns step -1 when invalid", async () => {
    expect(await verifyTotp(RFC_SECRET, "000000", at(1000), -1)).toEqual({
      valid: false,
      step: -1,
    });
  });

  it("accepts Persian digits and embedded spaces", async () => {
    const code = await totpCode(RFC_SECRET, 1000);
    const fa = code.replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]!);
    expect((await verifyTotp(RFC_SECRET, fa, at(1000), -1)).valid).toBe(true);
    const spaced = `${code.slice(0, 3)} ${code.slice(3)}`;
    expect((await verifyTotp(RFC_SECRET, spaced, at(1000), -1)).valid).toBe(
      true,
    );
  });

  it("rejects malformed input", async () => {
    for (const bad of ["", "12345", "1234567", "abcdef"]) {
      expect((await verifyTotp(RFC_SECRET, bad, at(1000), -1)).valid).toBe(
        false,
      );
    }
  });
});

describe("otpauthUri", () => {
  it("carries the parameters authenticators need", () => {
    const uri = otpauthUri("JBSWY3DPEHPK3PXP");
    expect(uri.startsWith("otpauth://totp/")).toBe(true);
    expect(uri).toContain("secret=JBSWY3DPEHPK3PXP");
    expect(uri).toContain("algorithm=SHA1");
    expect(uri).toContain("digits=6");
    expect(uri).toContain("period=30");
    expect(uri).toContain("issuer=Amanatha");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run tests/totp.test.ts`
Expected: FAIL — cannot resolve `../src/totp`.

- [ ] **Step 3: Write the implementation**

Create `apps/api/src/totp.ts`:

```ts
export const TOTP_DIGITS = 6;
export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_SKEW_STEPS = 1;

const B32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const SECRET_BYTES = 20;
const ISSUER = "Amanatha";
const ACCOUNT = "owner";

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = value * 256 + byte;
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[Math.floor(value / 2 ** (bits - 5)) % 32]!;
      value %= 2 ** (bits - 5);
      bits -= 5;
    }
  }
  if (bits > 0) out += B32_ALPHABET[(value * 2 ** (5 - bits)) % 32]!;
  return out;
}

export function base32Decode(value: string): Uint8Array | null {
  const clean = value.replace(/\s+/g, "").replace(/=+$/, "").toUpperCase();
  if (clean.length === 0) return null;

  const bytes: number[] = [];
  let bits = 0;
  let acc = 0;
  for (const ch of clean) {
    const idx = B32_ALPHABET.indexOf(ch);
    if (idx === -1) return null;
    acc = acc * 32 + idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push(Math.floor(acc / 2 ** (bits - 8)) % 256);
      acc %= 2 ** (bits - 8);
      bits -= 8;
    }
  }
  return new Uint8Array(bytes);
}

export function generateSecret(): string {
  return base32Encode(crypto.getRandomValues(new Uint8Array(SECRET_BYTES)));
}

export function stepForTime(nowMs: number): number {
  return Math.floor(nowMs / 1000 / TOTP_PERIOD_SECONDS);
}

/** Big-endian 8-byte counter. Uses arithmetic, not bitwise: `&`/`>>` coerce to int32. */
function counterBytes(step: number): Uint8Array {
  const out = new Uint8Array(8);
  let rest = step;
  for (let i = 7; i >= 0; i--) {
    out[i] = rest % 256;
    rest = Math.floor(rest / 256);
  }
  return out;
}

export async function totpCode(secret: string, step: number): Promise<string> {
  const key = base32Decode(secret);
  if (!key) throw new Error("invalid_secret");

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(
    await crypto.subtle.sign("HMAC", cryptoKey, counterBytes(step)),
  );

  // RFC 4226 dynamic truncation.
  const offset = mac[mac.length - 1]! & 0x0f;
  const binary =
    ((mac[offset]! & 0x7f) << 24) |
    (mac[offset + 1]! << 16) |
    (mac[offset + 2]! << 8) |
    mac[offset + 3]!;

  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, "0");
}

/** Persian (U+06F0–9) and Arabic-Indic (U+0660–9) digits → Latin. */
function toLatinDigits(value: string): string {
  return value.replace(/[۰-۹٠-٩]/g, (ch) => {
    const code = ch.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
}

function sameDigits(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyTotp(
  secret: string,
  code: string,
  nowMs: number,
  lastStep: number,
): Promise<{ valid: boolean; step: number }> {
  const normalized = toLatinDigits(code).replace(/\s+/g, "");
  if (!new RegExp(`^\\d{${TOTP_DIGITS}}$`).test(normalized)) {
    return { valid: false, step: -1 };
  }

  const current = stepForTime(nowMs);
  for (let delta = -TOTP_SKEW_STEPS; delta <= TOTP_SKEW_STEPS; delta++) {
    const step = current + delta;
    // Skip already-consumed steps so a code cannot be replayed inside its window.
    if (step < 0 || step <= lastStep) continue;
    if (sameDigits(await totpCode(secret, step), normalized)) {
      return { valid: true, step };
    }
  }
  return { valid: false, step: -1 };
}

export function otpauthUri(secret: string): string {
  const params = new URLSearchParams({
    secret,
    issuer: ISSUER,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });
  return `otpauth://totp/${ISSUER}:${ACCOUNT}?${params.toString()}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx vitest run tests/totp.test.ts`
Expected: PASS. If a vector fails, the fault is almost always the counter packing or the truncation offset — re-read `counterBytes` and the `& 0x0f` offset before touching the vectors, which are authoritative.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/totp.ts apps/api/tests/totp.test.ts
git commit -m "feat(api): add RFC 6238 TOTP module with replay and skew handling"
```

---

### Task 2: Throttle module and migration

**Files:**
- Create: `apps/api/migrations/0002_auth_throttle.sql`
- Create: `apps/api/src/throttle.ts`
- Create: `apps/api/tests/throttle.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `MAX_FAILURES = 5`, `LOCK_DURATION_MS = 900_000`
  - `type ThrottleState = { failedCount: number; lockedUntilMs: number | null }`
  - `CLEARED_STATE: ThrottleState`
  - `evaluateThrottle(state, nowMs): { locked: boolean; retryAfterSeconds: number }`
  - `afterFailure(state, nowMs): ThrottleState`
  - `loadThrottle(db): Promise<ThrottleState>`
  - `saveThrottle(db, state): Promise<void>`

- [ ] **Step 1: Write the migration**

Create `apps/api/migrations/0002_auth_throttle.sql`:

```sql
CREATE TABLE auth_throttle (
  id           TEXT PRIMARY KEY,
  failed_count INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT
);
```

- [ ] **Step 2: Write the failing test**

Create `apps/api/tests/throttle.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  afterFailure,
  CLEARED_STATE,
  evaluateThrottle,
  LOCK_DURATION_MS,
  MAX_FAILURES,
} from "../src/throttle";

const NOW = Date.UTC(2026, 6, 1);

describe("evaluateThrottle", () => {
  it("treats the cleared state as unlocked", () => {
    expect(evaluateThrottle(CLEARED_STATE, NOW)).toEqual({
      locked: false,
      retryAfterSeconds: 0,
    });
  });

  it("is never locked without a lock timestamp", () => {
    expect(
      evaluateThrottle({ failedCount: 99, lockedUntilMs: null }, NOW).locked,
    ).toBe(false);
  });

  it("reports the remaining whole seconds, rounded up", () => {
    const state = { failedCount: 0, lockedUntilMs: NOW + 61_500 };
    expect(evaluateThrottle(state, NOW)).toEqual({
      locked: true,
      retryAfterSeconds: 62,
    });
  });

  it("unlocks once the window passes", () => {
    const state = { failedCount: 0, lockedUntilMs: NOW + 1000 };
    expect(evaluateThrottle(state, NOW + 1001).locked).toBe(false);
  });
});

describe("afterFailure", () => {
  it("does not lock before the limit", () => {
    let state = CLEARED_STATE;
    for (let i = 0; i < MAX_FAILURES - 1; i++) {
      state = afterFailure(state, NOW);
      expect(evaluateThrottle(state, NOW).locked).toBe(false);
    }
    expect(state.failedCount).toBe(MAX_FAILURES - 1);
  });

  it("locks on the final allowed failure", () => {
    let state = CLEARED_STATE;
    for (let i = 0; i < MAX_FAILURES; i++) state = afterFailure(state, NOW);

    const verdict = evaluateThrottle(state, NOW);
    expect(verdict.locked).toBe(true);
    expect(verdict.retryAfterSeconds).toBe(LOCK_DURATION_MS / 1000);
    // Counter resets so the next lock needs another full run of failures.
    expect(state.failedCount).toBe(0);
    expect(state.lockedUntilMs).toBe(NOW + LOCK_DURATION_MS);
  });

  it("needs another full run of failures to lock again", () => {
    let state = CLEARED_STATE;
    for (let i = 0; i < MAX_FAILURES; i++) state = afterFailure(state, NOW);
    const later = NOW + LOCK_DURATION_MS + 1;
    state = afterFailure(state, later);
    expect(evaluateThrottle(state, later).locked).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/api && npx vitest run tests/throttle.test.ts`
Expected: FAIL — cannot resolve `../src/throttle`.

- [ ] **Step 4: Write the implementation**

Create `apps/api/src/throttle.ts`:

```ts
export const MAX_FAILURES = 5;
export const LOCK_DURATION_MS = 15 * 60 * 1000;

const ROW_ID = "global";

export type ThrottleState = {
  failedCount: number;
  lockedUntilMs: number | null;
};

export const CLEARED_STATE: ThrottleState = {
  failedCount: 0,
  lockedUntilMs: null,
};

export function evaluateThrottle(
  state: ThrottleState,
  nowMs: number,
): { locked: boolean; retryAfterSeconds: number } {
  if (state.lockedUntilMs === null || state.lockedUntilMs <= nowMs) {
    return { locked: false, retryAfterSeconds: 0 };
  }
  return {
    locked: true,
    retryAfterSeconds: Math.ceil((state.lockedUntilMs - nowMs) / 1000),
  };
}

export function afterFailure(
  state: ThrottleState,
  nowMs: number,
): ThrottleState {
  const failedCount = state.failedCount + 1;
  if (failedCount >= MAX_FAILURES) {
    // Reset the counter as the lock lands, so re-locking needs a fresh run.
    return { failedCount: 0, lockedUntilMs: nowMs + LOCK_DURATION_MS };
  }
  return { failedCount, lockedUntilMs: state.lockedUntilMs };
}

export async function loadThrottle(db: D1Database): Promise<ThrottleState> {
  const row = await db
    .prepare("SELECT failed_count, locked_until FROM auth_throttle WHERE id = ?")
    .bind(ROW_ID)
    .first<{ failed_count: number; locked_until: string | null }>();
  if (!row) return CLEARED_STATE;

  const parsed = row.locked_until ? Date.parse(row.locked_until) : NaN;
  return {
    failedCount: row.failed_count,
    lockedUntilMs: Number.isFinite(parsed) ? parsed : null,
  };
}

export async function saveThrottle(
  db: D1Database,
  state: ThrottleState,
): Promise<void> {
  const lockedUntil =
    state.lockedUntilMs === null
      ? null
      : new Date(state.lockedUntilMs).toISOString();
  await db
    .prepare(
      `INSERT INTO auth_throttle (id, failed_count, locked_until)
       VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         failed_count = excluded.failed_count,
         locked_until = excluded.locked_until`,
    )
    .bind(ROW_ID, state.failedCount, lockedUntil)
    .run();
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/api && npx vitest run tests/throttle.test.ts`
Expected: PASS.

- [ ] **Step 6: Apply the migration locally**

Run: `cd apps/api && npx wrangler d1 migrations apply pat-db --local`
Expected: `0002_auth_throttle.sql ✅`. Then confirm the table exists:

```bash
cd apps/api && npx wrangler d1 execute pat-db --local \
  --command "SELECT name FROM sqlite_master WHERE type='table' AND name='auth_throttle';"
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/migrations/0002_auth_throttle.sql apps/api/src/throttle.ts apps/api/tests/throttle.test.ts
git commit -m "feat(api): add login attempt throttling with pure decision core"
```

---

### Task 3: Wire TOTP and throttling into login

**Files:**
- Modify: `apps/api/src/routes/auth.ts`

**Interfaces:**
- Consumes: `verifyTotp`, `stepForTime` (Task 1); `loadThrottle`, `saveThrottle`, `evaluateThrottle`, `afterFailure`, `CLEARED_STATE` (Task 2).
- Produces: settings helpers reused by Task 4 —
  - `TOTP_SECRET_KEY = "totp_secret"`, `TOTP_PENDING_KEY = "totp_pending_secret"`, `TOTP_LAST_STEP_KEY = "totp_last_step"`
  - `getSetting(db, key): Promise<string | null>`
  - `setSetting(db, key, value): Promise<void>`
  - `deleteSetting(db, key): Promise<void>`

- [ ] **Step 1: Add settings helpers and imports**

In `apps/api/src/routes/auth.ts`, add to the imports:

```ts
import { stepForTime, verifyTotp } from "../totp";
import {
  afterFailure,
  CLEARED_STATE,
  evaluateThrottle,
  loadThrottle,
  saveThrottle,
} from "../throttle";
```

Then, below the existing `setPasswordHash`, add generic settings helpers and the key constants. The file already has `getPasswordHash`/`setPasswordHash` bound to `PASSWORD_HASH_KEY`; these generalise the same two statements rather than duplicating them per key:

```ts
export const TOTP_SECRET_KEY = "totp_secret";
export const TOTP_PENDING_KEY = "totp_pending_secret";
export const TOTP_LAST_STEP_KEY = "totp_last_step";

async function getSetting(
  db: D1Database,
  key: string,
): Promise<string | null> {
  const row = await db
    .prepare("SELECT value FROM settings WHERE key = ?")
    .bind(key)
    .first<{ value: string }>();
  return row?.value ?? null;
}

async function setSetting(
  db: D1Database,
  key: string,
  value: string,
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .bind(key, value)
    .run();
}

async function deleteSetting(db: D1Database, key: string): Promise<void> {
  await db.prepare("DELETE FROM settings WHERE key = ?").bind(key).run();
}

/** Last consumed TOTP step, or -1 when none has been used yet. */
async function getLastStep(db: D1Database): Promise<number> {
  const raw = await getSetting(db, TOTP_LAST_STEP_KEY);
  const parsed = raw === null ? NaN : Number(raw);
  return Number.isInteger(parsed) ? parsed : -1;
}
```

- [ ] **Step 2: Replace the login handler**

Replace the whole existing `auth.post("/login", …)` handler with:

```ts
auth.post("/login", async (c) => {
  const now = Date.now();

  const throttle = await loadThrottle(c.env.DB);
  const verdict = evaluateThrottle(throttle, now);
  if (verdict.locked) {
    return c.json(
      {
        error: "too_many_attempts",
        retryAfterSeconds: verdict.retryAfterSeconds,
      },
      429,
    );
  }

  const stored = await getPasswordHash(c.env.DB);
  if (stored === null) {
    return c.json({ error: "setup_required" }, 401);
  }

  const body = await c.req.json<{ password?: string; code?: string }>();

  const passwordOk =
    !!body.password && (await verifyPassword(body.password, stored));
  if (!passwordOk) {
    await saveThrottle(c.env.DB, afterFailure(throttle, now));
    return c.json({ error: "invalid_credentials" }, 401);
  }

  const secret = await getSetting(c.env.DB, TOTP_SECRET_KEY);

  if (secret !== null) {
    // The password was correct, so asking for the code is not a failed attempt.
    if (!body.code) {
      return c.json({ error: "totp_required" }, 401);
    }

    const lastStep = await getLastStep(c.env.DB);
    const result = await verifyTotp(secret, body.code, now, lastStep);
    if (!result.valid) {
      await saveThrottle(c.env.DB, afterFailure(throttle, now));
      return c.json({ error: "invalid_code" }, 401);
    }
    await setSetting(c.env.DB, TOTP_LAST_STEP_KEY, String(result.step));
  }

  await saveThrottle(c.env.DB, CLEARED_STATE);

  const token = await signSession(c.env.SESSION_SECRET);
  setCookie(c, SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return c.json({ ok: true });
});
```

`stepForTime` is imported for Task 4's use; if the typecheck flags it as unused at this point, add it in Task 4 instead.

- [ ] **Step 3: Typecheck and run the API suite**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json 2>/dev/null || npx wrangler types >/dev/null && npx vitest run`
Expected: existing 4 tests plus Tasks 1–2 tests pass. If `tsconfig.json` has no suitable target for `--noEmit`, rely on `npx vitest run` plus the deploy-time check in Task 9.

- [ ] **Step 4: Manually verify the login paths still work**

With `npm run dev` running from the repo root:

```bash
# correct password, 2FA off → 200 with a session cookie
curl -s -c /tmp/cj -X POST http://127.0.0.1:8787/api/auth/login \
  -H 'Content-Type: application/json' -d '{"password":"dev1234"}'
# wrong password → invalid_credentials
curl -s -X POST http://127.0.0.1:8787/api/auth/login \
  -H 'Content-Type: application/json' -d '{"password":"nope"}'
```

Expected: `{"ok":true}` then `{"error":"invalid_credentials"}`.

- [ ] **Step 5: Verify the lock engages, then clear it**

Run the wrong-password call five times total, then once more:

```bash
for i in 1 2 3 4 5; do curl -s -X POST http://127.0.0.1:8787/api/auth/login \
  -H 'Content-Type: application/json' -d '{"password":"nope"}'; echo; done
curl -s -i -X POST http://127.0.0.1:8787/api/auth/login \
  -H 'Content-Type: application/json' -d '{"password":"dev1234"}' | head -1
```

Expected: the final call returns `429` with `too_many_attempts` — proving the lock applies even to a correct password. Then clear it so later steps are not blocked:

```bash
cd apps/api && npx wrangler d1 execute pat-db --local \
  --command "DELETE FROM auth_throttle;"
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/auth.ts
git commit -m "feat(api): require TOTP and throttle attempts on login"
```

---

### Task 4: TOTP management endpoints

**Files:**
- Modify: `apps/api/src/routes/auth.ts`

**Interfaces:**
- Consumes: helpers and constants from Task 3; `generateSecret`, `otpauthUri`, `verifyTotp`, `stepForTime` from Task 1.
- Produces: `GET /auth/totp`, `POST /auth/totp/enroll`, `POST /auth/totp/confirm`, `POST /auth/totp/disable`; `POST /auth/password` gains `code`.

- [ ] **Step 1: Add the four endpoints**

Append to `apps/api/src/routes/auth.ts`, before `export default auth;`:

```ts
auth.get("/totp", requireAuth, async (c) => {
  const secret = await getSetting(c.env.DB, TOTP_SECRET_KEY);
  return c.json({ enabled: secret !== null });
});

auth.post("/totp/enroll", requireAuth, async (c) => {
  if ((await getSetting(c.env.DB, TOTP_SECRET_KEY)) !== null) {
    // Refuse to silently replace a working authenticator.
    return c.json({ error: "already_enabled" }, 409);
  }

  const stored = await getPasswordHash(c.env.DB);
  if (stored === null) return c.json({ error: "setup_required" }, 401);

  const body = await c.req.json<{ password?: string }>();
  if (!body.password || !(await verifyPassword(body.password, stored))) {
    return c.json({ error: "invalid_credentials" }, 401);
  }

  const secret = generateSecret();
  await setSetting(c.env.DB, TOTP_PENDING_KEY, secret);
  return c.json({ secret, otpauthUri: otpauthUri(secret) });
});

auth.post("/totp/confirm", requireAuth, async (c) => {
  const pending = await getSetting(c.env.DB, TOTP_PENDING_KEY);
  if (pending === null) return c.json({ error: "not_pending" }, 409);

  const body = await c.req.json<{ code?: string }>();
  if (!body.code) return c.json({ error: "code_required" }, 400);

  const result = await verifyTotp(pending, body.code, Date.now(), -1);
  if (!result.valid) return c.json({ error: "invalid_code" }, 401);

  await setSetting(c.env.DB, TOTP_SECRET_KEY, pending);
  await setSetting(c.env.DB, TOTP_LAST_STEP_KEY, String(result.step));
  await deleteSetting(c.env.DB, TOTP_PENDING_KEY);
  return c.json({ ok: true });
});

auth.post("/totp/disable", requireAuth, async (c) => {
  const secret = await getSetting(c.env.DB, TOTP_SECRET_KEY);
  if (secret === null) return c.json({ error: "not_enabled" }, 409);

  const stored = await getPasswordHash(c.env.DB);
  if (stored === null) return c.json({ error: "setup_required" }, 401);

  const body = await c.req.json<{ password?: string; code?: string }>();
  if (!body.password || !(await verifyPassword(body.password, stored))) {
    return c.json({ error: "invalid_credentials" }, 401);
  }
  if (!body.code) return c.json({ error: "code_required" }, 400);

  const lastStep = await getLastStep(c.env.DB);
  const result = await verifyTotp(secret, body.code, Date.now(), lastStep);
  if (!result.valid) return c.json({ error: "invalid_code" }, 401);

  await deleteSetting(c.env.DB, TOTP_SECRET_KEY);
  await deleteSetting(c.env.DB, TOTP_LAST_STEP_KEY);
  return c.json({ ok: true });
});
```

Add `generateSecret` and `otpauthUri` to the `../totp` import.

Note: these deliberately skip throttling — they sit behind `requireAuth`, and an authenticated owner fat-fingering their own enrollment code must not lock themselves out.

- [ ] **Step 2: Require a code on password change while 2FA is on**

In the existing `auth.post("/password", …)`, widen the body type and insert the code check after the current-password check succeeds and before hashing the new password:

```ts
  const body = await c.req.json<{
    currentPassword?: string;
    newPassword?: string;
    code?: string;
  }>();
```

```ts
  const secret = await getSetting(c.env.DB, TOTP_SECRET_KEY);
  if (secret !== null) {
    if (!body.code) return c.json({ error: "code_required" }, 400);
    const lastStep = await getLastStep(c.env.DB);
    const result = await verifyTotp(secret, body.code, Date.now(), lastStep);
    if (!result.valid) return c.json({ error: "invalid_code" }, 401);
    await setSetting(c.env.DB, TOTP_LAST_STEP_KEY, String(result.step));
  }
```

- [ ] **Step 3: Verify the full enrollment cycle by hand**

With dev running and a session cookie in `/tmp/cj`:

```bash
# enroll
curl -s -b /tmp/cj -X POST http://127.0.0.1:8787/api/auth/totp/enroll \
  -H 'Content-Type: application/json' -d '{"password":"dev1234"}'
```

Take the returned `secret`, compute the current code with the module, and confirm:

```bash
cd apps/api && node --input-type=module -e '
import { totpCode, stepForTime } from "./src/totp.ts";
' 2>/dev/null || echo "use the vitest REPL or a scratch test to compute the code"
```

Simplest reliable route: add a temporary scratch test that prints `await totpCode(SECRET, stepForTime(Date.now()))`, run it, use the code within 30 seconds, then delete the scratch file. Confirm:

```bash
curl -s -b /tmp/cj -X POST http://127.0.0.1:8787/api/auth/totp/confirm \
  -H 'Content-Type: application/json' -d '{"code":"<code>"}'
curl -s -b /tmp/cj http://127.0.0.1:8787/api/auth/totp
```

Expected: `{"ok":true}` then `{"enabled":true}`. Then verify replay is refused — logging in with the *same* code must fail with `invalid_code`, while a fresh code succeeds.

- [ ] **Step 4: Run the API suite**

Run: `cd apps/api && npx vitest run`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/auth.ts
git commit -m "feat(api): add TOTP enroll, confirm, disable, and status endpoints"
```

---

### Task 5: Reset command

**Files:**
- Create: `scripts/reset-2fa.sh`
- Modify: `package.json` (root, add the `2fa:reset` script)

**Interfaces:**
- Consumes: the `settings` keys and `auth_throttle` table.
- Produces: `npm run 2fa:reset [-- --remote]`.

- [ ] **Step 1: Write the script**

Create `scripts/reset-2fa.sh`:

```bash
#!/usr/bin/env bash
# Clear TOTP enrollment and any attempt lock, so login falls back to the
# password alone. Recovery path for a lost authenticator.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="--local"

for arg in "$@"; do
  case "$arg" in
    --local) TARGET="--local" ;;
    --remote) TARGET="--remote" ;;
    *)
      echo "Unknown option: $arg" >&2
      echo "Usage: npm run 2fa:reset [-- --remote]" >&2
      exit 2
      ;;
  esac
done

if [[ "$TARGET" == "--remote" ]]; then
  echo "⚠️  This will disable two-factor auth on PRODUCTION (pat-db --remote)."
  read -r -p "Type RESET to continue: " reply
  if [[ "$reply" != "RESET" ]]; then
    echo "Aborted."
    exit 1
  fi
fi

cd "$ROOT/apps/api"

echo "Clearing TOTP enrollment and attempt lock ($TARGET) …"
npx wrangler d1 execute pat-db "$TARGET" --command "
  DELETE FROM settings WHERE key IN ('totp_secret','totp_pending_secret','totp_last_step');
  DELETE FROM auth_throttle;
" >/dev/null

echo "Done. Two-factor auth is off and any lockout is cleared."
echo "Log in with your password, then re-enroll from Settings."
```

- [ ] **Step 2: Make it executable and wire the npm script**

```bash
chmod +x scripts/reset-2fa.sh
```

In the root `package.json`, add to `scripts`:

```json
    "2fa:reset": "bash scripts/reset-2fa.sh",
```

- [ ] **Step 3: Verify it works and is idempotent**

With 2FA currently enabled locally (from Task 4):

```bash
npm run 2fa:reset
cd apps/api && npx wrangler d1 execute pat-db --local \
  --command "SELECT key FROM settings;"
```

Expected: only `password_hash` remains — no `totp_*` keys. Run `npm run 2fa:reset` a second time and confirm it still succeeds and prints the same message.

- [ ] **Step 4: Verify the unknown-flag guard**

Run: `npm run 2fa:reset -- --bogus`
Expected: prints `Unknown option: --bogus` and exits non-zero, rather than silently resetting local.

- [ ] **Step 5: Commit**

```bash
git add scripts/reset-2fa.sh package.json
git commit -m "feat(scripts): add 2fa:reset command for a lost authenticator"
```

---

### Task 6: API client and the login code field

**Files:**
- Modify: `apps/web/src/api/client.ts`
- Modify: `apps/web/src/routes/Login.tsx`
- Delete: `apps/web/src/pages/LoginPage.tsx`
- Create: `apps/web/src/routes/Login.test.tsx`

**Interfaces:**
- Consumes: the endpoints from Tasks 3–4; `toLatinDigits` from `src/format/digits.ts`.
- Produces:
  - `api.login(password: string, code?: string)`
  - `api.totpStatus()` → `{ enabled: boolean }`
  - `api.totpEnroll(password: string)` → `{ secret: string; otpauthUri: string }`
  - `api.totpConfirm(code: string)`
  - `api.totpDisable(password: string, code: string)`
  - `api.changePassword(current: string, next: string, code?: string)`

- [ ] **Step 1: Extend the API client**

In `apps/web/src/api/client.ts`, add the types near `AuthStatus`:

```ts
export type TotpStatus = { enabled: boolean }
export type TotpEnrollment = { secret: string; otpauthUri: string }
```

Replace `login` and `changePassword`, and add the TOTP calls, inside the `api` object:

```ts
  login: (password: string, code?: string) =>
    authFetch<{ ok: true }>('/login', {
      method: 'POST',
      body: JSON.stringify(code ? { password, code } : { password }),
    }),

  totpStatus: () => authFetch<TotpStatus>('/totp'),

  totpEnroll: (password: string) =>
    authFetch<TotpEnrollment>('/totp/enroll', {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),

  totpConfirm: (code: string) =>
    authFetch<{ ok: true }>('/totp/confirm', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),

  totpDisable: (password: string, code: string) =>
    authFetch<{ ok: true }>('/totp/disable', {
      method: 'POST',
      body: JSON.stringify({ password, code }),
    }),

  changePassword: (currentPassword: string, newPassword: string, code?: string) =>
    authFetch<{ ok: true }>('/password', {
      method: 'POST',
      body: JSON.stringify(
        code
          ? { currentPassword, newPassword, code }
          : { currentPassword, newPassword },
      ),
    }),
```

`authFetch` already prefixes `/api/auth`, so `/totp` resolves to `/api/auth/totp`.

- [ ] **Step 2: Add the new error copy**

In `apps/web/src/routes/Login.tsx`, extend `ERROR_MESSAGES`:

```ts
  invalid_code: 'کد اشتباهه.',
  code_required: 'کد دو مرحله‌ای رو وارد کن.',
  too_many_attempts: 'تلاش زیاد بود. چند دقیقه دیگه امتحان کن.',
```

- [ ] **Step 3: Write the failing test**

Create `apps/web/src/routes/Login.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from '@testing-library/react'

const { statusMock, loginMock, navigateMock } = vi.hoisted(() => ({
  statusMock: vi.fn(),
  loginMock: vi.fn(),
  navigateMock: vi.fn(),
}))

vi.mock('react-router', () => ({
  useNavigate: () => navigateMock,
  Navigate: () => null,
}))

vi.mock('../api/client', () => ({
  api: { status: statusMock, login: loginMock, setup: vi.fn() },
}))

import { Login } from './Login'

const CODE_LABEL = 'کد دو مرحله‌ای'

describe('Login with 2FA', () => {
  beforeEach(() => {
    statusMock.mockReset().mockResolvedValue({
      ok: true,
      data: { setupRequired: false, authenticated: false },
    })
    loginMock.mockReset()
    navigateMock.mockReset()
  })
  afterEach(() => cleanup())

  async function typePassword(value: string) {
    const field = await waitFor(() =>
      screen.getByLabelText('رمز عبور') as HTMLInputElement,
    )
    fireEvent.change(field, { target: { value } })
    return field
  }

  it('does not show the code field before the server asks for it', async () => {
    await typePassword('secret')
    expect(screen.queryByLabelText(CODE_LABEL)).toBe(null)
  })

  it('reveals the code field on totp_required and keeps the password', async () => {
    loginMock.mockResolvedValue({
      ok: false,
      status: 401,
      error: 'totp_required',
    })
    const password = await typePassword('secret')
    fireEvent.click(screen.getByRole('button', { name: 'ورود' }))

    const code = await waitFor(() => screen.getByLabelText(CODE_LABEL))
    expect(code).toBeTruthy()
    expect(password.value).toBe('secret')
    // totp_required is a normal step, not an error to shout about.
    expect(screen.queryByText('کد اشتباهه.')).toBe(null)
  })

  it('sends password and code together on the second submit', async () => {
    loginMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      error: 'totp_required',
    })
    await typePassword('secret')
    fireEvent.click(screen.getByRole('button', { name: 'ورود' }))

    const code = await waitFor(() => screen.getByLabelText(CODE_LABEL))
    loginMock.mockResolvedValueOnce({ ok: true, data: { ok: true } })
    fireEvent.change(code, { target: { value: '287082' } })
    fireEvent.click(screen.getByRole('button', { name: 'ورود' }))

    await waitFor(() =>
      expect(loginMock).toHaveBeenLastCalledWith('secret', '287082'),
    )
  })

  it('shows a message when attempts are throttled', async () => {
    loginMock.mockResolvedValue({
      ok: false,
      status: 429,
      error: 'too_many_attempts',
    })
    await typePassword('secret')
    fireEvent.click(screen.getByRole('button', { name: 'ورود' }))
    await waitFor(() =>
      expect(
        screen.getByText('تلاش زیاد بود. چند دقیقه دیگه امتحان کن.'),
      ).toBeTruthy(),
    )
  })

  it('keeps only digits in the code field', async () => {
    loginMock.mockResolvedValue({
      ok: false,
      status: 401,
      error: 'totp_required',
    })
    await typePassword('secret')
    fireEvent.click(screen.getByRole('button', { name: 'ورود' }))

    const code = (await waitFor(() =>
      screen.getByLabelText(CODE_LABEL),
    )) as HTMLInputElement
    fireEvent.change(code, { target: { value: '۱۲۳abc۴' } })
    expect(code.value).toBe('1234')
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/routes/Login.test.tsx`
Expected: FAIL — no code field, and the password input has no accessible label yet.

- [ ] **Step 5: Update `Login.tsx`**

Add the import:

```ts
import { toLatinDigits } from '../format/digits'
```

Add state beside the existing hooks:

```ts
  const [code, setCode] = useState('')
  const [codeRequired, setCodeRequired] = useState(false)
```

Replace the body of `handleSubmit` after the setup branch so it passes the code and handles `totp_required`:

```ts
    const loginResult = await api.login(password, codeRequired ? code : undefined)
    setSubmitting(false)

    if (!loginResult.ok) {
      if (loginResult.error === 'totp_required') {
        // Not an error — the password was accepted, we just need the code.
        setCodeRequired(true)
        setError(null)
        return
      }
      setError(errorMessage(loginResult.error))
      return
    }

    navigate('/', { replace: true })
```

In the form, give the password input `id="auth-password"` with a matching `<label htmlFor="auth-password">رمز عبور</label>` if it does not already have one, then add the code field, rendered only when required:

```tsx
        {codeRequired && (
          <>
            <label className="auth-label" htmlFor="auth-code">
              کد دو مرحله‌ای
            </label>
            <input
              id="auth-code"
              className="auth-input"
              type="text"
              inputMode="numeric"
              dir="ltr"
              autoComplete="one-time-password"
              maxLength={6}
              value={code}
              onChange={(e) =>
                setCode(toLatinDigits(e.target.value).replace(/\D/g, '').slice(0, 6))
              }
              autoFocus
              disabled={submitting}
              required
            />
          </>
        )}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd apps/web && npx vitest run src/routes/Login.test.tsx`
Expected: PASS — 5 tests.

- [ ] **Step 7: Delete the dead login page**

```bash
git rm apps/web/src/pages/LoginPage.tsx
```

Then confirm nothing referenced it: `cd apps/web && grep -rn "LoginPage" src || echo "clean"`

- [ ] **Step 8: Typecheck and run the web suite**

Run: `cd apps/web && npx tsc -b && npx vitest run`
Expected: typecheck clean; all web tests pass.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/api/client.ts apps/web/src/routes/Login.tsx apps/web/src/routes/Login.test.tsx
git commit -m "feat(web): prompt for a TOTP code on login when 2FA is enabled"
```

---

### Task 7: Enrollment wizard

**Files:**
- Create: `apps/web/src/components/TotpEnroll.tsx`
- Create: `apps/web/src/components/TotpEnroll.test.tsx`
- Modify: `apps/web/package.json` (add `qrcode.react`)
- Modify: `apps/web/src/styles/global.css` (enrollment styles)

**Interfaces:**
- Consumes: `api.totpEnroll`, `api.totpConfirm` (Task 6).
- Produces:

```ts
export type TotpEnrollProps = {
  onEnabled: () => void
  onCancel: () => void
}
```

- [ ] **Step 1: Add the QR dependency**

```bash
cd apps/web && npm install qrcode.react
```

Confirm it landed in `dependencies` (not `devDependencies`) — it ships in the bundle.

- [ ] **Step 2: Write the failing test**

Create `apps/web/src/components/TotpEnroll.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from '@testing-library/react'

const { enrollMock, confirmMock } = vi.hoisted(() => ({
  enrollMock: vi.fn(),
  confirmMock: vi.fn(),
}))

vi.mock('../api/client', () => ({
  api: { totpEnroll: enrollMock, totpConfirm: confirmMock },
  apiErrorMessage: (code: string) => code,
}))

vi.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value }: { value: string }) => (
    <svg data-testid="qr" data-value={value} />
  ),
}))

import { TotpEnroll } from './TotpEnroll'

const SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'

describe('TotpEnroll', () => {
  beforeEach(() => {
    enrollMock.mockReset().mockResolvedValue({
      ok: true,
      data: { secret: SECRET, otpauthUri: `otpauth://totp/x?secret=${SECRET}` },
    })
    confirmMock.mockReset()
  })
  afterEach(() => cleanup())

  async function reachScanStep() {
    render(<TotpEnroll onEnabled={() => {}} onCancel={() => {}} />)
    fireEvent.change(screen.getByLabelText('رمز عبور'), {
      target: { value: 'dev1234' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'ادامه' }))
    await waitFor(() => expect(screen.getByTestId('qr')).toBeTruthy())
  }

  it('asks for the password before revealing a secret', () => {
    render(<TotpEnroll onEnabled={() => {}} onCancel={() => {}} />)
    expect(screen.getByLabelText('رمز عبور')).toBeTruthy()
    expect(screen.queryByTestId('qr')).toBe(null)
  })

  it('shows the QR and the secret after enrolling', async () => {
    await reachScanStep()
    expect(screen.getByTestId('qr').getAttribute('data-value')).toContain(SECRET)
    // Secret is shown in groups of four for manual entry.
    expect(screen.getByText(/GEZD/)).toBeTruthy()
  })

  it('surfaces a wrong password without advancing', async () => {
    enrollMock.mockResolvedValue({
      ok: false,
      status: 401,
      error: 'invalid_credentials',
    })
    render(<TotpEnroll onEnabled={() => {}} onCancel={() => {}} />)
    fireEvent.change(screen.getByLabelText('رمز عبور'), {
      target: { value: 'wrong' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'ادامه' }))
    await waitFor(() => expect(screen.getByText('invalid_credentials')).toBeTruthy())
    expect(screen.queryByTestId('qr')).toBe(null)
  })

  it('calls onEnabled after a valid code', async () => {
    const onEnabled = vi.fn()
    render(<TotpEnroll onEnabled={onEnabled} onCancel={() => {}} />)
    fireEvent.change(screen.getByLabelText('رمز عبور'), {
      target: { value: 'dev1234' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'ادامه' }))
    await waitFor(() => expect(screen.getByTestId('qr')).toBeTruthy())

    confirmMock.mockResolvedValue({ ok: true, data: { ok: true } })
    fireEvent.change(screen.getByLabelText('کد دو مرحله‌ای'), {
      target: { value: '287082' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'فعال کردن' }))

    await waitFor(() => expect(confirmMock).toHaveBeenCalledWith('287082'))
    expect(onEnabled).toHaveBeenCalled()
  })

  it('stays on the confirm step when the code is wrong', async () => {
    await reachScanStep()
    confirmMock.mockResolvedValue({
      ok: false,
      status: 401,
      error: 'invalid_code',
    })
    fireEvent.change(screen.getByLabelText('کد دو مرحله‌ای'), {
      target: { value: '000000' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'فعال کردن' }))
    await waitFor(() => expect(screen.getByText('invalid_code')).toBeTruthy())
    expect(screen.getByTestId('qr')).toBeTruthy()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/components/TotpEnroll.test.tsx`
Expected: FAIL — cannot resolve `./TotpEnroll`.

- [ ] **Step 4: Write the component**

Create `apps/web/src/components/TotpEnroll.tsx`:

```tsx
import { useState, type FormEvent } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { api, apiErrorMessage } from '../api/client'
import { toLatinDigits } from '../format/digits'

export type TotpEnrollProps = {
  onEnabled: () => void
  onCancel: () => void
}

/** Groups the base32 secret into fours so it can be typed by hand. */
function groupSecret(secret: string): string {
  return secret.replace(/(.{4})/g, '$1 ').trim()
}

export function TotpEnroll({ onEnabled, onCancel }: TotpEnrollProps) {
  const [password, setPassword] = useState('')
  const [secret, setSecret] = useState<string | null>(null)
  const [uri, setUri] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleEnroll(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const result = await api.totpEnroll(password)
    setBusy(false)
    if (!result.ok) {
      setError(apiErrorMessage(result.error))
      return
    }
    setSecret(result.data.secret)
    setUri(result.data.otpauthUri)
    setPassword('')
  }

  async function handleConfirm(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const result = await api.totpConfirm(code)
    setBusy(false)
    if (!result.ok) {
      setError(apiErrorMessage(result.error))
      return
    }
    onEnabled()
  }

  if (secret === null) {
    return (
      <form className="totp-enroll" onSubmit={handleEnroll}>
        <p className="totp-enroll__lead">
          برای فعال کردن ورود دو مرحله‌ای، اول رمزت رو تأیید کن.
        </p>
        <label className="auth-label" htmlFor="totp-password">
          رمز عبور
        </label>
        <input
          id="totp-password"
          className="auth-input"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy}
          required
        />
        <div className="totp-enroll__actions">
          <button type="submit" className="auth-submit" disabled={busy}>
            {busy ? '…' : 'ادامه'}
          </button>
          <button
            type="button"
            className="home-add-cancel"
            onClick={onCancel}
            disabled={busy}
          >
            انصراف
          </button>
        </div>
        {error && <p className="auth-error">{error}</p>}
      </form>
    )
  }

  return (
    <form className="totp-enroll" onSubmit={handleConfirm}>
      <p className="totp-enroll__lead">
        این کد رو با برنامهٔ اعتبارسنجی اسکن کن.
      </p>
      <div className="totp-enroll__qr">
        <QRCodeSVG value={uri} size={180} />
      </div>
      <p className="totp-enroll__secret" dir="ltr">
        {groupSecret(secret)}
      </p>
      <p className="totp-enroll__lead">
        بعد کد شش‌رقمی رو اینجا بزن تا فعال بشه.
      </p>
      <label className="auth-label" htmlFor="totp-code">
        کد دو مرحله‌ای
      </label>
      <input
        id="totp-code"
        className="auth-input"
        type="text"
        inputMode="numeric"
        dir="ltr"
        autoComplete="one-time-password"
        maxLength={6}
        value={code}
        onChange={(e) =>
          setCode(toLatinDigits(e.target.value).replace(/\D/g, '').slice(0, 6))
        }
        disabled={busy}
        required
      />
      <div className="totp-enroll__actions">
        <button type="submit" className="auth-submit" disabled={busy}>
          {busy ? '…' : 'فعال کردن'}
        </button>
        <button
          type="button"
          className="home-add-cancel"
          onClick={onCancel}
          disabled={busy}
        >
          انصراف
        </button>
      </div>
      {error && <p className="auth-error">{error}</p>}
    </form>
  )
}
```

- [ ] **Step 5: Add the styles**

Append to `apps/web/src/styles/global.css` — every `font-size` must use a token to keep the invariant:

```css
.totp-enroll {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.totp-enroll__lead {
  margin: 0;
  color: var(--muted);
  font-size: var(--text-status);
  line-height: 1.5;
}

.totp-enroll__qr {
  display: flex;
  justify-content: center;
  padding: 0.75rem;
  background: #faf6ef;
  border: 1px solid var(--rule);
  border-radius: 8px;
}

.totp-enroll__secret {
  margin: 0;
  text-align: center;
  font-family: monospace;
  font-size: var(--text-status);
  letter-spacing: 0.08em;
  color: var(--ink);
  word-break: break-all;
}

.totp-enroll__actions {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd apps/web && npx vitest run src/components/TotpEnroll.test.tsx`
Expected: PASS — 5 tests. Then confirm the CSS invariant:
`grep -c 'font-size:\s*[0-9]' src/styles/global.css` → `0`.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/TotpEnroll.tsx apps/web/src/components/TotpEnroll.test.tsx apps/web/src/styles/global.css apps/web/package.json package-lock.json
git commit -m "feat(web): add TOTP enrollment wizard with QR and manual secret"
```

---

### Task 8: Settings section

**Files:**
- Modify: `apps/web/src/routes/Settings.tsx`

**Interfaces:**
- Consumes: `api.totpStatus`, `api.totpDisable` (Task 6); `TotpEnroll` (Task 7); existing `ConfirmPress`.
- Produces: no new exports.

- [ ] **Step 1: Add imports and state**

In `apps/web/src/routes/Settings.tsx`:

```ts
import { TotpEnroll } from '../components/TotpEnroll'
import { toLatinDigits } from '../format/digits'
```

```ts
  const [totpEnabled, setTotpEnabled] = useState<boolean | null>(null)
  const [enrolling, setEnrolling] = useState(false)
  const [disarmPassword, setDisarmPassword] = useState('')
  const [disarmCode, setDisarmCode] = useState('')
  const [totpError, setTotpError] = useState<string | null>(null)
```

- [ ] **Step 2: Load the status on mount**

```ts
  const loadTotp = useCallback(async () => {
    const result = await api.totpStatus()
    setTotpEnabled(result.ok ? result.data.enabled : false)
  }, [])

  useEffect(() => {
    void loadTotp()
  }, [loadTotp])
```

Add `useCallback` / `useEffect` to the React import if they are not already there.

- [ ] **Step 3: Add the disable handler**

```ts
  async function handleDisableTotp() {
    setTotpError(null)
    const result = await api.totpDisable(disarmPassword, disarmCode)
    if (!result.ok) {
      setTotpError(apiErrorMessage(result.error))
      return
    }
    setDisarmPassword('')
    setDisarmCode('')
    await loadTotp()
  }
```

- [ ] **Step 4: Add the section**

Insert above the backup section:

```tsx
        <section className="settings-sec">
          <h2 className="settings-h2">ورود دو مرحله‌ای</h2>

          {totpEnabled === null ? (
            <p className="settings-note">…</p>
          ) : enrolling ? (
            <TotpEnroll
              onEnabled={async () => {
                setEnrolling(false)
                await loadTotp()
              }}
              onCancel={() => setEnrolling(false)}
            />
          ) : totpEnabled ? (
            <>
              <p className="settings-note">فعاله. برای ورود به کد هم نیاز داری.</p>
              <label className="auth-label" htmlFor="totp-off-password">
                رمز عبور
              </label>
              <input
                id="totp-off-password"
                className="auth-input"
                type="password"
                autoComplete="current-password"
                value={disarmPassword}
                onChange={(e) => setDisarmPassword(e.target.value)}
              />
              <label className="auth-label" htmlFor="totp-off-code">
                کد دو مرحله‌ای
              </label>
              <input
                id="totp-off-code"
                className="auth-input"
                type="text"
                inputMode="numeric"
                dir="ltr"
                maxLength={6}
                value={disarmCode}
                onChange={(e) =>
                  setDisarmCode(
                    toLatinDigits(e.target.value).replace(/\D/g, '').slice(0, 6),
                  )
                }
              />
              <ConfirmPress
                label="غیرفعال کردن"
                confirmLabel="مطمئنی؟ دوباره بزن"
                onConfirm={handleDisableTotp}
                className="settings-danger"
              />
            </>
          ) : (
            <>
              <p className="settings-note">
                یه لایهٔ امنیت بیشتر با برنامهٔ اعتبارسنجی.
              </p>
              <button
                type="button"
                className="auth-submit"
                onClick={() => setEnrolling(true)}
              >
                فعال کردن
              </button>
            </>
          )}

          {totpError && <p className="auth-error">{totpError}</p>}
        </section>
```

Reuse whatever section/heading/note class names the file already uses — check with `grep -n 'className="settings' src/routes/Settings.tsx` and match them rather than inventing new ones. If `settings-danger` does not exist, reuse the class already applied to the logout button.

- [ ] **Step 5: Typecheck, test, verify the CSS invariant**

Run:

```bash
cd apps/web && npx tsc -b && npx vitest run
grep -c 'font-size:\s*[0-9]' src/styles/global.css
```

Expected: typecheck clean, all tests pass, `0` hardcoded font sizes.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/routes/Settings.tsx
git commit -m "feat(web): manage two-factor auth from Settings"
```

---

### Task 9: End-to-end verification, push, deploy

**Files:**
- No source changes expected; fixes go in their own commit.

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Full verification**

```bash
cd /home/ramin/personal-asset-tracker
npm run test:all
cd apps/web && npx tsc -b && npm run build
grep -c 'font-size:\s*[0-9]' src/styles/global.css
```

Expected: every workspace suite passes, typecheck clean, build succeeds, `0` hardcoded font sizes.

- [ ] **Step 2: Start dev and reset to a clean auth state**

```bash
cd /home/ramin/personal-asset-tracker
npm run 2fa:reset          # local: 2FA off, no lockout
npm run dev
```

`scripts/dev.sh` applies local migrations automatically, so `0002_auth_throttle` lands here.

- [ ] **Step 3: Enroll with a real authenticator**

In the browser at `http://127.0.0.1:5173`: log in with the password, open Settings → «ورود دو مرحله‌ای» → «فعال کردن», confirm the password, scan the QR with a real authenticator app, enter the code, confirm it enables. Screenshot the enrollment screen at a phone viewport (390×844).

- [ ] **Step 4: Verify the login gate**

Log out. Log back in and confirm:
- password alone → the code field appears, no error shown
- a wrong code → `کد اشتباهه.`
- the correct code → lands on Home
- **replay:** immediately log out and reuse the *same* code → rejected; a fresh code works

- [ ] **Step 5: Verify the lockout**

Submit a wrong code five times, then a correct password and code. Expect `تلاش زیاد بود…`. Confirm it clears:

```bash
npm run 2fa:reset
```

- [ ] **Step 6: Verify recovery end to end**

With 2FA enabled again, run `npm run 2fa:reset`, reload, and confirm login needs only the password — this is the whole recovery story, so it must be seen working rather than assumed.

- [ ] **Step 7: Push**

```bash
cd /home/ramin/personal-asset-tracker
git status --short          # expect clean
git push
```

- [ ] **Step 8: Apply the production migration**

The new table must exist in production **before** the Worker that queries it goes live:

```bash
cd apps/api && npx wrangler d1 migrations apply pat-db --remote
```

Expected: `0002_auth_throttle.sql ✅`. Verify:

```bash
cd apps/api && npx wrangler d1 execute pat-db --remote \
  --command "SELECT name FROM sqlite_master WHERE type='table' AND name='auth_throttle';"
```

- [ ] **Step 9: Deploy the Worker, then the web app**

Order matters — the API must understand the new login contract before the UI starts sending `code`:

```bash
cd apps/api && npx wrangler deploy
cd ../web && npm run build && npx wrangler pages deploy dist \
  --project-name personal-asset-tracker-web --branch main --commit-dirty=true
```

- [ ] **Step 10: Verify production**

```bash
PROD=https://personal-asset-tracker-web.pages.dev
curl -s -o /dev/null -w "root: %{http_code}\n" $PROD
curl -s $PROD/api/health; echo
curl -s $PROD/api/auth/status; echo
curl -s $PROD | grep -oE 'assets/index-[A-Za-z0-9_-]+\.(css|js)'
```

Expected: `200`, `{"ok":true}`, `{"setupRequired":false,"authenticated":false}` — **note `/status` must still not contain any 2FA field** — and asset hashes matching the fresh build.

Then confirm production login still works with the password alone (production has no TOTP enrolled yet), and enroll there only if desired.

- [ ] **Step 11: Commit any fixes**

Only if Steps 3–6 or 10 surfaced problems:

```bash
git add -A && git commit -m "fix: address 2FA verification findings" && git push
```

---

## Self-Review

**Spec coverage**

| Spec section | Task |
|---|---|
| §3.1 settings keys | 3 (helpers), 4 (writes) |
| §3.3 `auth_throttle` migration | 2 |
| §4 TOTP module, all functions | 1 |
| §5 throttle pure core + D1 layer | 2 |
| §6.1 login flow, all 7 branches | 3 |
| §6.2 four TOTP endpoints, re-auth, no throttle on confirm/disable | 4 |
| §6.3 password change requires code | 4 step 2 |
| §6.4 `/status` unchanged | verified in 9 step 10 |
| §7 reset command, safety, idempotence | 5 |
| §8.1 login code field + copy | 6 |
| §8.2 `TotpEnroll` | 7 |
| §8.3 Settings section | 8 |
| §8.4 api client | 6 step 1 |
| §8.5 delete dead `LoginPage.tsx` | 6 step 7 |
| §9.1 RFC 6238 vectors, skew, replay, Persian digits | 1 |
| §9.2 throttle pure-core tests | 2 |
| §9.3 web tests | 6, 7 |
| §9.4 manual verification | 9 |

No gaps.

**Type consistency**

`verifyTotp(secret, code, nowMs, lastStep) → { valid, step }` is defined in Task 1 and called with exactly four arguments in Tasks 3 and 4. `lastStep = -1` is used for fresh enrollment in Task 4's `/confirm`, matching the sentinel in the Global Constraints. `ThrottleState` is produced by `loadThrottle`/`afterFailure` and consumed by `evaluateThrottle`/`saveThrottle` under that one name throughout. `api.login(password, code?)` is declared in Task 6 step 1 and called with two arguments in Task 6 step 5 and asserted as `('secret', '287082')` in its test. `TotpEnrollProps` is `{ onEnabled, onCancel }` in Task 7 and both are passed in Task 8.

**Ordering dependencies**

Task 2 must precede Task 3 (login loads throttle state). Task 3 must precede Task 4 (Task 4 uses `getSetting`/`setSetting`/`getLastStep` and the key constants defined in Task 3). Task 6 must precede Tasks 7–8 (both call client methods added there). In Task 9, the **production migration must run before the Worker deploy**, and the **Worker must deploy before the web app**, or a live client will send `code` to an API that ignores it while the throttle table is missing.
