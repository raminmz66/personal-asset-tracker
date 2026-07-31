import type { Transaction } from "./types";

export function balanceQuantity(txs: Transaction[]): number {
  return txs.reduce((q, t) => {
    if (t.type === "deposit") return q + t.amount;
    if (t.type === "return") return q - t.amount;
    return q;
  }, 0);
}

export function isBalanceSettled(qty: number): boolean {
  return qty === 0;
}

export function isBalanceActive(qty: number): boolean {
  return qty > 0;
}
