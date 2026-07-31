import { describe, it, expect } from "vitest";
import {
  buildExportDoc,
  parseExportDoc,
  EXPORT_SCHEMA_VERSION,
} from "../src/export-schema";
import { ValidationError } from "../src/validate";
import type { Person, Balance, Transaction } from "../src/types";

const person: Person = {
  id: "p1",
  name: "Ali",
  note: null,
  createdAt: "2026-07-31T00:00:00.000Z",
  updatedAt: "2026-07-31T00:00:00.000Z",
};

const balance: Balance = {
  id: "b1",
  personId: "p1",
  label: "تومان",
  createdAt: "2026-07-31T00:00:00.000Z",
  updatedAt: "2026-07-31T00:00:00.000Z",
};

const deposit: Transaction = {
  id: "t1",
  balanceId: "b1",
  type: "deposit",
  amount: 100,
  date: "2026-07-31",
  note: null,
  createdAt: "2026-07-31T00:00:00.000Z",
  updatedAt: "2026-07-31T00:00:00.000Z",
};

describe("export schema", () => {
  it("exports schema version constant", () => {
    expect(EXPORT_SCHEMA_VERSION).toBe(1);
  });

  it("round-trips empty doc", () => {
    const doc = buildExportDoc([], [], []);
    expect(parseExportDoc(doc).schemaVersion).toBe(1);
  });

  it("round-trips populated doc", () => {
    const doc = buildExportDoc([person], [balance], [deposit]);
    const parsed = parseExportDoc(doc);
    expect(parsed.people).toEqual([person]);
    expect(parsed.balances).toEqual([balance]);
    expect(parsed.transactions).toEqual([deposit]);
    expect(parsed.exportedAt).toBeTruthy();
  });

  it("rejects unknown version", () => {
    expect(() =>
      parseExportDoc({
        schemaVersion: 99,
        people: [],
        balances: [],
        transactions: [],
      }),
    ).toThrow(ValidationError);
  });

  it("rejects non-object", () => {
    expect(() => parseExportDoc(null)).toThrow(ValidationError);
    expect(() => parseExportDoc("bad")).toThrow(ValidationError);
  });

  it("rejects missing arrays", () => {
    expect(() =>
      parseExportDoc({ schemaVersion: 1, exportedAt: "2026-07-31T00:00:00.000Z" }),
    ).toThrow(ValidationError);
  });

  it("rejects invalid person fields", () => {
    const doc = buildExportDoc([], [], []);
    expect(() =>
      parseExportDoc({
        ...doc,
        people: [{ id: 1, name: "Ali" }],
      }),
    ).toThrow(ValidationError);
  });

  it("rejects invalid balance fields", () => {
    const doc = buildExportDoc([], [], []);
    expect(() =>
      parseExportDoc({
        ...doc,
        balances: [{ id: "b1", personId: "p1", label: 123 }],
      }),
    ).toThrow(ValidationError);
  });

  it("rejects invalid transaction type", () => {
    const doc = buildExportDoc([], [], []);
    expect(() =>
      parseExportDoc({
        ...doc,
        transactions: [
          {
            id: "t1",
            balanceId: "b1",
            type: "withdraw",
            amount: 50,
            date: "2026-07-31",
            note: null,
            createdAt: "2026-07-31T00:00:00.000Z",
            updatedAt: "2026-07-31T00:00:00.000Z",
          },
        ],
      }),
    ).toThrow(ValidationError);
  });

  it("accepts return transaction type", () => {
    const ret: Transaction = { ...deposit, id: "t2", type: "return" };
    const doc = buildExportDoc([person], [balance], [ret]);
    expect(parseExportDoc(doc).transactions[0].type).toBe("return");
  });
});
