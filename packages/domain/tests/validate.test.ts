import { describe, it, expect } from "vitest";
import {
  assertBalanceReturnAllowed,
  assertPositiveAmount,
  ValidationError,
} from "../src/validate";

describe("validation", () => {
  it("rejects non-positive amounts", () => {
    expect(() => assertPositiveAmount(0)).toThrow(ValidationError);
  });

  it("rejects over-return", () => {
    expect(() => assertBalanceReturnAllowed(50, 51)).toThrow(ValidationError);
  });

  it("allows exact full return", () => {
    expect(() => assertBalanceReturnAllowed(50, 50)).not.toThrow();
  });
});
