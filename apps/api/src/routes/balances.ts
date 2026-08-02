import { Hono } from "hono";
import {
  assertBalanceReturnAllowed,
  assertPositiveAmount,
  balanceQuantity,
  isBalanceActive,
  isBalanceSettled,
  ValidationError,
  type Balance,
  type Transaction,
} from "@pat/domain";
import type { Bindings } from "../env";
import { enableForeignKeys } from "../db";
import { isDuplicateKeyError, resolveId } from "../ids";
import { requireAuth } from "../middleware/requireAuth";

type BalanceRow = {
  id: string;
  person_id: string;
  label: string;
  created_at: string;
  updated_at: string;
};

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

type BalanceWithQuantity = Balance & { quantity: number };
type BalanceDetail = BalanceWithQuantity & { transactions: Transaction[] };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validationResponse(err: ValidationError) {
  return { error: err.code };
}

function rowToBalance(row: BalanceRow): Balance {
  return {
    id: row.id,
    personId: row.person_id,
    label: row.label,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
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

function parseLabel(value: unknown): string {
  if (typeof value !== "string") {
    throw new ValidationError("invalid_label", "برچسب الزامی است");
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new ValidationError("invalid_label", "برچسب الزامی است");
  }
  return trimmed;
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

function parseNote(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return typeof value === "string" ? value : null;
}

function parseFilter(value: string | undefined): "active" | "settled" | "all" {
  if (value === undefined || value === "active") return "active";
  if (value === "settled" || value === "all") return value;
  return "active";
}

async function personExists(db: D1Database, personId: string): Promise<boolean> {
  const row = await db
    .prepare("SELECT id FROM people WHERE id = ?")
    .bind(personId)
    .first<{ id: string }>();
  return row !== null;
}

async function fetchBalanceRow(
  db: D1Database,
  id: string,
): Promise<BalanceRow | null> {
  return db
    .prepare(
      "SELECT id, person_id, label, created_at, updated_at FROM balances WHERE id = ?",
    )
    .bind(id)
    .first<BalanceRow>();
}

async function fetchTransactionsForBalance(
  db: D1Database,
  balanceId: string,
): Promise<Transaction[]> {
  const result = await db
    .prepare(
      "SELECT id, balance_id, type, amount, date, note, created_at, updated_at FROM transactions WHERE balance_id = ? ORDER BY date, created_at",
    )
    .bind(balanceId)
    .all<TransactionRow>();
  return (result.results ?? []).map(rowToTransaction);
}

async function fetchTransactionRow(
  db: D1Database,
  id: string,
): Promise<Transaction | null> {
  const row = await db
    .prepare(
      "SELECT id, balance_id, type, amount, date, note, created_at, updated_at FROM transactions WHERE id = ?",
    )
    .bind(id)
    .first<TransactionRow>();
  return row ? rowToTransaction(row) : null;
}

async function balanceWithQuantity(
  db: D1Database,
  row: BalanceRow,
): Promise<BalanceWithQuantity> {
  const txs = await fetchTransactionsForBalance(db, row.id);
  return {
    ...rowToBalance(row),
    quantity: balanceQuantity(txs),
  };
}

function matchesFilter(
  qty: number,
  filter: "active" | "settled" | "all",
): boolean {
  if (filter === "all") return true;
  if (filter === "active") return isBalanceActive(qty);
  return isBalanceSettled(qty);
}

export const personBalances = new Hono<{ Bindings: Bindings }>();

personBalances.use("*", requireAuth);

personBalances.get("/", async (c) => {
  const personId = c.req.param("personId");
  if (!(await personExists(c.env.DB, personId))) {
    return c.json({ error: "not_found" }, 404);
  }

  const filter = parseFilter(c.req.query("filter"));
  const balancesResult = await c.env.DB.prepare(
    "SELECT id, person_id, label, created_at, updated_at FROM balances WHERE person_id = ? ORDER BY label COLLATE NOCASE",
  )
    .bind(personId)
    .all<BalanceRow>();

  const rows = balancesResult.results ?? [];
  const result: BalanceWithQuantity[] = [];

  for (const row of rows) {
    const item = await balanceWithQuantity(c.env.DB, row);
    if (matchesFilter(item.quantity, filter)) {
      result.push(item);
    }
  }

  return c.json(result);
});

personBalances.post("/", async (c) => {
  const personId = c.req.param("personId");
  if (!(await personExists(c.env.DB, personId))) {
    return c.json({ error: "not_found" }, 404);
  }

  let body: {
    id?: unknown;
    txId?: unknown;
    label?: unknown;
    amount?: unknown;
    date?: unknown;
    note?: unknown;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  let label: string;
  let amount: number;
  let date: string;
  try {
    label = parseLabel(body.label);
    amount = parseAmount(body.amount);
    date = parseDate(body.date);
  } catch (err) {
    if (err instanceof ValidationError) {
      return c.json(validationResponse(err), 400);
    }
    throw err;
  }

  const note = parseNote(body.note);
  const balanceId = resolveId(body.id);
  const txId = resolveId(body.txId);
  const now = new Date().toISOString();

  await enableForeignKeys(c.env.DB);
  try {
    // The batch is atomic, so a duplicate balanceId fails the whole thing
    // cleanly rather than leaving a balance with no opening deposit.
    await c.env.DB.batch([
      c.env.DB.prepare(
        "INSERT INTO balances (id, person_id, label, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      ).bind(balanceId, personId, label, now, now),
      c.env.DB.prepare(
        "INSERT INTO transactions (id, balance_id, type, amount, date, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      ).bind(txId, balanceId, "deposit", amount, date, note, now, now),
    ]);
  } catch (err) {
    if (!isDuplicateKeyError(err)) throw err;
    const existing = await fetchBalanceRow(c.env.DB, balanceId);
    if (!existing) throw err;
    const txs = await fetchTransactionsForBalance(c.env.DB, balanceId);
    return c.json(
      { ...rowToBalance(existing), quantity: balanceQuantity(txs) },
      200,
    );
  }

  return c.json(
    {
      ...rowToBalance({
        id: balanceId,
        person_id: personId,
        label,
        created_at: now,
        updated_at: now,
      }),
      quantity: amount,
    },
    201,
  );
});

const balances = new Hono<{ Bindings: Bindings }>();

balances.use("*", requireAuth);

balances.get("/:id", async (c) => {
  const row = await fetchBalanceRow(c.env.DB, c.req.param("id"));
  if (!row) {
    return c.json({ error: "not_found" }, 404);
  }

  const txs = await fetchTransactionsForBalance(c.env.DB, row.id);
  const detail: BalanceDetail = {
    ...rowToBalance(row),
    quantity: balanceQuantity(txs),
    transactions: txs,
  };
  return c.json(detail);
});

balances.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const row = await fetchBalanceRow(c.env.DB, id);
  if (!row) {
    return c.json({ error: "not_found" }, 404);
  }

  await enableForeignKeys(c.env.DB);
  await c.env.DB.prepare("DELETE FROM balances WHERE id = ?").bind(id).run();
  return c.json({ ok: true });
});

balances.post("/:id/transactions", async (c) => {
  const balanceId = c.req.param("id");
  const row = await fetchBalanceRow(c.env.DB, balanceId);
  if (!row) {
    return c.json({ error: "not_found" }, 404);
  }

  let body: {
    id?: unknown;
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

  const id = resolveId(body.id);

  // Checked before validation, not after. A retried return whose first attempt
  // got through would otherwise be measured against the balance it already
  // reduced, fail assertBalanceReturnAllowed, and be parked as a dead write.
  const alreadyApplied = await fetchTransactionRow(c.env.DB, id);
  if (alreadyApplied) {
    return c.json(alreadyApplied, 200);
  }

  let type: "deposit" | "return";
  let amount: number;
  let date: string;
  try {
    type = parseTxType(body.type);
    amount = parseAmount(body.amount);
    date = parseDate(body.date);
  } catch (err) {
    if (err instanceof ValidationError) {
      return c.json(validationResponse(err), 400);
    }
    throw err;
  }

  const note = parseNote(body.note);

  if (type === "return") {
    const txs = await fetchTransactionsForBalance(c.env.DB, balanceId);
    const qty = balanceQuantity(txs);
    try {
      assertBalanceReturnAllowed(qty, amount);
    } catch (err) {
      if (err instanceof ValidationError) {
        return c.json(validationResponse(err), 400);
      }
      throw err;
    }
  }

  const now = new Date().toISOString();

  await enableForeignKeys(c.env.DB);
  try {
    await c.env.DB.prepare(
      "INSERT INTO transactions (id, balance_id, type, amount, date, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(id, balanceId, type, amount, date, note, now, now)
      .run();
  } catch (err) {
    // Lost a race with a concurrent retry of the same queued write.
    if (!isDuplicateKeyError(err)) throw err;
    const existing = await fetchTransactionRow(c.env.DB, id);
    if (!existing) throw err;
    return c.json(existing, 200);
  }

  return c.json(
    rowToTransaction({
      id,
      balance_id: balanceId,
      type,
      amount,
      date,
      note,
      created_at: now,
      updated_at: now,
    }),
    201,
  );
});

export default balances;
