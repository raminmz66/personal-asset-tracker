import { describe, expect, it } from "vitest";
import {
  hashPassword,
  SESSION_TTL_MS,
  signSession,
  verifyPassword,
  verifySession,
} from "../src/auth";

const SECRET = "test-session-secret";

describe("verifyPassword", () => {
  it("returns true for the correct password", async () => {
    const stored = await hashPassword("correct-horse");
    expect(await verifyPassword("correct-horse", stored)).toBe(true);
  });

  it("returns false for the wrong password", async () => {
    const stored = await hashPassword("correct-horse");
    expect(await verifyPassword("wrong-password", stored)).toBe(false);
  });
});

describe("verifySession", () => {
  it("accepts a valid signed session", async () => {
    const now = Date.UTC(2026, 6, 1);
    const token = await signSession(SECRET, now);
    const payload = await verifySession(token, SECRET, now + 1000);
    expect(payload).toEqual({ exp: now + SESSION_TTL_MS });
  });

  it("rejects an expired session", async () => {
    const now = Date.UTC(2026, 6, 1);
    const token = await signSession(SECRET, now);
    const payload = await verifySession(token, SECRET, now + SESSION_TTL_MS + 1);
    expect(payload).toBeNull();
  });
});
