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
