import type { Transaction } from "./types";

function sumByType(txs: Transaction[], type: Transaction["type"]): number {
  return txs.reduce((sum, t) => (t.type === type ? sum + t.amount : sum), 0);
}

/** Everything ever put in, ignoring what has since gone back out. */
export function totalDeposited(txs: Transaction[]): number {
  return sumByType(txs, "deposit");
}

/** Everything ever handed back. Answers «چقدر پس داده‌ای؟». */
export function totalReturned(txs: Transaction[]): number {
  return sumByType(txs, "return");
}

/**
 * What is still held. Deliberately not clamped at zero: an imported backup
 * can carry amounts `assertPositiveAmount` would have rejected, and a
 * visibly wrong number beats a silently sanitized one.
 */
export function balanceQuantity(txs: Transaction[]): number {
  return totalDeposited(txs) - totalReturned(txs);
}

export function isBalanceSettled(qty: number): boolean {
  return qty === 0;
}

export function isBalanceActive(qty: number): boolean {
  return qty > 0;
}
