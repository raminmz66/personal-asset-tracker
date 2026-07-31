import { Hono } from "hono";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Bindings } from "../env";
import {
  hashPassword,
  PASSWORD_HASH_KEY,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  signSession,
  verifyPassword,
  verifySession,
} from "../auth";
import { requireAuth } from "../middleware/requireAuth";
import { verifyTotp } from "../totp";
import {
  afterFailure,
  CLEARED_STATE,
  evaluateThrottle,
  loadThrottle,
  saveThrottle,
} from "../throttle";

const auth = new Hono<{ Bindings: Bindings }>();

async function getPasswordHash(db: D1Database): Promise<string | null> {
  const row = await db
    .prepare("SELECT value FROM settings WHERE key = ?")
    .bind(PASSWORD_HASH_KEY)
    .first<{ value: string }>();
  return row?.value ?? null;
}

async function setPasswordHash(db: D1Database, value: string): Promise<void> {
  await db
    .prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .bind(PASSWORD_HASH_KEY, value)
    .run();
}

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

/** Last consumed TOTP step, or -1 when none has been used yet. */
async function getLastStep(db: D1Database): Promise<number> {
  const raw = await getSetting(db, TOTP_LAST_STEP_KEY);
  const parsed = raw === null ? NaN : Number(raw);
  return Number.isInteger(parsed) ? parsed : -1;
}

async function isAuthenticated(
  c: Context<{ Bindings: Bindings }>,
): Promise<boolean> {
  const token = getCookie(c, SESSION_COOKIE_NAME);
  if (!token) return false;
  const payload = await verifySession(token, c.env.SESSION_SECRET);
  return payload !== null;
}

auth.get("/status", async (c) => {
  const passwordHash = await getPasswordHash(c.env.DB);
  const authenticated = await isAuthenticated(c);
  return c.json({
    setupRequired: passwordHash === null,
    authenticated,
  });
});

auth.post("/setup", async (c) => {
  const existing = await getPasswordHash(c.env.DB);
  if (existing !== null) {
    return c.json({ error: "already_setup" }, 409);
  }

  const body = await c.req.json<{ password?: string }>();
  if (!body.password) {
    return c.json({ error: "password_required" }, 400);
  }

  const passwordHash = await hashPassword(body.password);
  await setPasswordHash(c.env.DB, passwordHash);
  return c.json({ ok: true });
});

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

auth.post("/logout", (c) => {
  deleteCookie(c, SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
  });
  return c.json({ ok: true });
});

auth.post("/password", requireAuth, async (c) => {
  const stored = await getPasswordHash(c.env.DB);
  if (stored === null) {
    return c.json({ error: "setup_required" }, 401);
  }

  const body = await c.req.json<{
    currentPassword?: string;
    newPassword?: string;
  }>();
  if (!body.currentPassword || !body.newPassword) {
    return c.json({ error: "invalid_credentials" }, 401);
  }

  const valid = await verifyPassword(body.currentPassword, stored);
  if (!valid) {
    return c.json({ error: "invalid_credentials" }, 401);
  }

  const passwordHash = await hashPassword(body.newPassword);
  await setPasswordHash(c.env.DB, passwordHash);
  return c.json({ ok: true });
});

export default auth;
