import { describe, it, expect } from "vitest";
import {
  balanceQuantity,
  isBalanceSettled,
  isBalanceActive,
  totalDeposited,
  totalReturned,
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

describe("totalDeposited / totalReturned", () => {
  const mixed: Transaction[] = [
    { ...base, id: "1", type: "deposit", amount: 200 },
    { ...base, id: "2", type: "return", amount: 50 },
    { ...base, id: "3", type: "deposit", amount: 100 },
  ];

  it("sums only deposits", () => {
    expect(totalDeposited(mixed)).toBe(300);
  });

  it("sums only returns", () => {
    expect(totalReturned(mixed)).toBe(50);
  });

  it("is zero with no txs", () => {
    expect(totalDeposited([])).toBe(0);
    expect(totalReturned([])).toBe(0);
  });

  it("is zero for the absent type", () => {
    const depositsOnly: Transaction[] = [
      { ...base, id: "1", type: "deposit", amount: 40 },
    ];
    const returnsOnly: Transaction[] = [
      { ...base, id: "1", type: "return", amount: 40 },
    ];
    expect(totalReturned(depositsOnly)).toBe(0);
    expect(totalDeposited(returnsOnly)).toBe(0);
  });

  it("keeps balanceQuantity equal to deposited minus returned", () => {
    expect(balanceQuantity(mixed)).toBe(
      totalDeposited(mixed) - totalReturned(mixed),
    );
  });

  it("does not clamp an over-returned balance to zero", () => {
    // Reachable only via a hand-edited import: parseExportDoc validates
    // types but never calls assertPositiveAmount. Show the bad number.
    const overReturned: Transaction[] = [
      { ...base, id: "1", type: "deposit", amount: 10 },
      { ...base, id: "2", type: "return", amount: 25 },
    ];
    expect(balanceQuantity(overReturned)).toBe(-15);
    expect(totalReturned(overReturned)).toBe(25);
  });
});
