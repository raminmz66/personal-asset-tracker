import { describe, expect, it } from "vitest";
import { isDuplicateKeyError, resolveId } from "../src/ids";

const UUID_SHAPE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const VALID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

describe("resolveId", () => {
  it("keeps a well-formed v4 uuid", () => {
    expect(resolveId(VALID)).toBe(VALID);
  });

  it("lowercases an uppercase uuid rather than rejecting it", () => {
    expect(resolveId(VALID.toUpperCase())).toBe(VALID);
  });

  it("mints a fresh uuid for a v1 uuid", () => {
    // Version nibble is 1, not 4.
    const v1 = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
    const id = resolveId(v1);
    expect(id).not.toBe(v1);
    expect(id).toMatch(UUID_SHAPE);
  });

  it("mints a fresh uuid for a bad variant nibble", () => {
    const bad = "3f2504e0-4f89-41d3-1a0c-0305e82c3301";
    expect(resolveId(bad)).not.toBe(bad);
  });

  it.each([undefined, null, "", "not-a-uuid", 42, {}, []])(
    "mints a fresh uuid for %p",
    (input) => {
      const id = resolveId(input);
      expect(id).toMatch(UUID_SHAPE);
      expect(id).not.toBe(input);
    },
  );

  it("does not reuse the same minted id twice", () => {
    expect(resolveId(undefined)).not.toBe(resolveId(undefined));
  });
});

describe("isDuplicateKeyError", () => {
  it("recognises a D1 unique-constraint failure", () => {
    expect(
      isDuplicateKeyError(
        new Error("D1_ERROR: UNIQUE constraint failed: people.id"),
      ),
    ).toBe(true);
  });

  it("recognises a primary-key failure", () => {
    expect(
      isDuplicateKeyError(new Error("PRIMARY KEY must be unique")),
    ).toBe(true);
  });

  it("does not swallow an unrelated error", () => {
    expect(isDuplicateKeyError(new Error("no such table: people"))).toBe(false);
  });

  it("handles a non-Error throw", () => {
    expect(isDuplicateKeyError("UNIQUE constraint failed")).toBe(true);
  });
});
