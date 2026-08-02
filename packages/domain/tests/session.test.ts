import { describe, expect, it } from "vitest";
import { SESSION_TTL_MS } from "../src/session";

describe("SESSION_TTL_MS", () => {
  it("is thirty days in milliseconds", () => {
    expect(SESSION_TTL_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });
});
