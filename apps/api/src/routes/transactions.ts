import { Hono } from "hono";
import {
  assertBalanceReturnAllowed,
  assertPositiveAmount,
  balanceQuantity,
  ValidationError,
  type Transaction,
} from "@pat/domain";
import type { Bindings } from "../env";
import { enableForeignKeys } from "../db";
import { requireAuth } from "../middleware/requireAuth";

type TransactionRow = {
  id: string;
  balance_id: string;
  type: "deposit" | "return";
  amount: number;
  date: string;
  note: string | null;
  created_at: string;
  updated_at: string;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validationResponse(err: ValidationError) {
  return { error: err.code };
}

function rowToTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    balanceId: row.balance_id,
    type: row.type,
    amount: row.amount,
    date: row.date,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseDate(value: unknown): string {
  if (typeof value !== "string" || !DATE_RE.test(value)) {
    throw new ValidationError("invalid_date", "تاریخ نامعتبر است");
  }
  return value;
}

function parseAmount(value: unknown): number {
  if (typeof value !== "number") {
    throw new ValidationError("invalid_amount", "مبلغ باید بزرگ‌تر از صفر باشد");
  }
  assertPositiveAmount(value);
  return value;
}

function parseTxType(value: unknown): "deposit" | "return" {
  if (value !== "deposit" && value !== "return") {
    throw new ValidationError("invalid_type", "نوع تراکنش نامعتبر است");
  }
  return value;
}

async function fetchTransactionRow(
  db: D1Database,
  id: string,
): Promise<TransactionRow | null> {
  return db
    .prepare(
      "SELECT id, balance_id, type, amount, date, note, created_at, updated_at FROM transactions WHERE id = ?",
    )
    .bind(id)
    .first<TransactionRow>();
}

async function fetchTransactionsForBalance(
  db: D1Database,
  balanceId: string,
): Promise<Transaction[]> {
  const result = await db
    .prepare(
      "SELECT id, balance_id, type, amount, date, note, created_at, updated_at FROM transactions WHERE balance_id = ?",
    )
    .bind(balanceId)
    .all<TransactionRow>();
  return (result.results ?? []).map(rowToTransaction);
}

function quantityExcluding(
  txs: Transaction[],
  excludeId: string,
): number {
  return balanceQuantity(txs.filter((t) => t.id !== excludeId));
}

const transactions = new Hono<{ Bindings: Bindings }>();

transactions.use("*", requireAuth);

transactions.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const existing = await fetchTransactionRow(c.env.DB, id);
  if (!existing) {
    return c.json({ error: "not_found" }, 404);
  }

  let body: {
    type?: unknown;
    amount?: unknown;
    date?: unknown;
    note?: unknown;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  let type = existing.type;
  let amount = existing.amount;
  let date = existing.date;
  let note = existing.note;

  try {
    if (body.type !== undefined) type = parseTxType(body.type);
    if (body.amount !== undefined) amount = parseAmount(body.amount);
    if (body.date !== undefined) date = parseDate(body.date);
  } catch (err) {
    if (err instanceof ValidationError) {
      return c.json(validationResponse(err), 400);
    }
    throw err;
  }

  if (body.note !== undefined) {
    note =
      body.note === null
        ? null
        : typeof body.note === "string"
          ? body.note
          : existing.note;
  }

  if (type === "return") {
    const txs = await fetchTransactionsForBalance(c.env.DB, existing.balance_id);
    const qty = quantityExcluding(txs, id);
    try {
      assertBalanceReturnAllowed(qty, amount);
    } catch (err) {
      if (err instanceof ValidationError) {
        return c.json(validationResponse(err), 400);
      }
      throw err;
    }
  }

  const updatedAt = new Date().toISOString();
  await enableForeignKeys(c.env.DB);
  await c.env.DB.prepare(
    "UPDATE transactions SET type = ?, amount = ?, date = ?, note = ?, updated_at = ? WHERE id = ?",
  )
    .bind(type, amount, date, note, updatedAt, id)
    .run();

  return c.json(
    rowToTransaction({
      ...existing,
      type,
      amount,
      date,
      note,
      updated_at: updatedAt,
    }),
  );
});

transactions.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const existing = await fetchTransactionRow(c.env.DB, id);
  if (!existing) {
    return c.json({ error: "not_found" }, 404);
  }

  const siblings = await fetchTransactionsForBalance(c.env.DB, existing.balance_id);
  const qtyAfter = quantityExcluding(siblings, id);
  if (qtyAfter < 0) {
    return c.json({ error: "invalid_delete" }, 400);
  }

  await enableForeignKeys(c.env.DB);
  await c.env.DB.prepare("DELETE FROM transactions WHERE id = ?").bind(id).run();
  return c.json({ ok: true });
});

export default transactions;
