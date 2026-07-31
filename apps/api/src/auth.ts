export const SESSION_COOKIE_NAME = "session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
export const PASSWORD_HASH_KEY = "password_hash";

const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_HASH_BITS = 256;
const SALT_BYTES = 16;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array | null {
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(value: string): Uint8Array | null {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad =
    padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return base64ToBytes(padded + pad);
}

async function importPbkdf2Key(password: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
}

async function derivePbkdf2Hash(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const keyMaterial = await importPbkdf2Key(password);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    keyMaterial,
    PBKDF2_HASH_BITS,
  );
  return new Uint8Array(bits);
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function parseStoredPasswordHash(stored: string): {
  iterations: number;
  salt: Uint8Array;
  hash: Uint8Array;
} | null {
  const parts = stored.split(":");
  if (parts.length !== 4 || parts[0] !== "pbkdf2-sha256") return null;

  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations <= 0) return null;

  const salt = base64ToBytes(parts[2]);
  const hash = base64ToBytes(parts[3]);
  if (!salt || !hash) return null;

  return { iterations, salt, hash };
}

/** Hash a password with PBKDF2-SHA256 and a random salt. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derivePbkdf2Hash(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2-sha256:${PBKDF2_ITERATIONS}:${bytesToBase64(salt)}:${bytesToBase64(hash)}`;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** Verify a password against a stored PBKDF2-SHA256 hash. */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parsed = parseStoredPasswordHash(stored);
  if (!parsed) return false;

  const derived = await derivePbkdf2Hash(
    password,
    parsed.salt,
    parsed.iterations,
  );
  if (derived.length !== parsed.hash.length) return false;

  return timingSafeEqual(derived, parsed.hash);
}

export type SessionPayload = { exp: number };

/** Sign a session token with HMAC-SHA256. */
export async function signSession(
  secret: string,
  nowMs: number = Date.now(),
): Promise<string> {
  const payload: SessionPayload = { exp: nowMs + SESSION_TTL_MS };
  const payloadB64 = bytesToBase64Url(
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payloadB64),
  );
  return `${payloadB64}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

/** Verify a session token; returns payload or null if invalid/expired. */
export async function verifySession(
  token: string,
  secret: string,
  nowMs: number = Date.now(),
): Promise<SessionPayload | null> {
  const dot = token.indexOf(".");
  if (dot <= 0) return null;

  const payloadB64 = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);
  const sigBytes = base64UrlToBytes(sigB64);
  if (!sigBytes) return null;

  const key = await importHmacKey(secret);
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    sigBytes,
    new TextEncoder().encode(payloadB64),
  );
  if (!valid) return null;

  const payloadBytes = base64UrlToBytes(payloadB64);
  if (!payloadBytes) return null;

  let payload: SessionPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(payloadBytes)) as SessionPayload;
  } catch {
    return null;
  }

  if (typeof payload.exp !== "number" || payload.exp <= nowMs) return null;
  return payload;
}
