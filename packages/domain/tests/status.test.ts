import { describe, expect, it } from "vitest";
import { personShortStatus } from "../src/status";

describe("personShortStatus", () => {
  it("formats active count with Persian digits", () => {
    expect(personShortStatus(1)).toBe("۱ موجودی فعال");
    expect(personShortStatus(3)).toBe("۳ موجودی فعال");
  });

  it("returns تسویه when settled", () => {
    expect(personShortStatus(0)).toBe("تسویه");
  });
});
