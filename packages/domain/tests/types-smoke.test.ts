import { describe, it, expect } from "vitest";
import type { ExportDoc } from "../src/types";

describe("types", () => {
  it("export doc schemaVersion is 1", () => {
    const doc: ExportDoc = {
      schemaVersion: 1,
      exportedAt: "2026-07-31T00:00:00.000Z",
      people: [],
      balances: [],
      transactions: [],
    };
    expect(doc.schemaVersion).toBe(1);
  });
});
