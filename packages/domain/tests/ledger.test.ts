import { describe, it, expect } from "vitest";
import {
  balanceQuantity,
  isBalanceSettled,
  isBalanceActive,
} from "../src/ledger";
import type { Transaction } from "../src/types";

const base = {
  id: "t1",
  balanceId: "b1",
  date: "2026-07-01",
  note: null,
  createdAt: "",
  updatedAt: "",
};

describe("balanceQuantity", () => {
  it("sums deposits minus returns", () => {
    const txs: Transaction[] = [
      { ...base, id: "1", type: "deposit", amount: 200 },
      { ...base, id: "2", type: "return", amount: 50 },
      { ...base, id: "3", type: "deposit", amount: 100 },
    ];
    expect(balanceQuantity(txs)).toBe(250);
  });

  it("is zero with no txs", () => {
    expect(balanceQuantity([])).toBe(0);
  });
});

describe("settled / active", () => {
  it("treats zero as settled and inactive", () => {
    expect(isBalanceSettled(0)).toBe(true);
    expect(isBalanceActive(0)).toBe(false);
    expect(isBalanceActive(250)).toBe(true);
  });
});
