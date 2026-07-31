import { describe, it, expect } from "vitest";
import { personShortStatus } from "../src/status";

describe("personShortStatus", () => {
  it("shows active count when > 0", () => {
    expect(personShortStatus(1)).toBe("1 موجودی فعال");
    expect(personShortStatus(3)).toBe("3 موجودی فعال");
  });

  it("shows settled when active count is 0", () => {
    expect(personShortStatus(0)).toBe("تسویه");
  });
});
