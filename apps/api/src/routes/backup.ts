import { Hono } from "hono";
import {
  buildExportDoc,
  parseExportDoc,
  ValidationError,
  type Balance,
  type Person,
  type Transaction,
} from "@pat/domain";
import type { Bindings } from "../env";
import { enableForeignKeys } from "../db";
import { requireAuth } from "../middleware/requireAuth";

type PersonRow = {
  id: string;
  name: string;
  note: string | null;
  created_at: string;
  updated_at: string;
};

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

const backup = new Hono<{ Bindings: Bindings }>();

backup.use("*", requireAuth);

function rowToPerson(row: PersonRow): Person {
  return {
    id: row.id,
    name: row.name,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
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

function validationResponse(err: ValidationError) {
  return { error: err.code };
}

async function fetchAllPeople(db: D1Database): Promise<Person[]> {
  const result = await db
    .prepare(
      "SELECT id, name, note, created_at, updated_at FROM people ORDER BY created_at",
    )
    .all<PersonRow>();
  return (result.results ?? []).map(rowToPerson);
}

async function fetchAllBalances(db: D1Database): Promise<Balance[]> {
  const result = await db
    .prepare(
      "SELECT id, person_id, label, created_at, updated_at FROM balances ORDER BY created_at",
    )
    .all<BalanceRow>();
  return (result.results ?? []).map(rowToBalance);
}

async function fetchAllTransactions(db: D1Database): Promise<Transaction[]> {
  const result = await db
    .prepare(
      "SELECT id, balance_id, type, amount, date, note, created_at, updated_at FROM transactions ORDER BY created_at",
    )
    .all<TransactionRow>();
  return (result.results ?? []).map(rowToTransaction);
}

backup.get("/export", async (c) => {
  const db = c.env.DB;
  const people = await fetchAllPeople(db);
  const balances = await fetchAllBalances(db);
  const transactions = await fetchAllTransactions(db);
  return c.json(buildExportDoc(people, balances, transactions));
});

backup.post("/import", async (c) => {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  let doc;
  try {
    doc = parseExportDoc(raw);
  } catch (err) {
    if (err instanceof ValidationError) {
      return c.json(validationResponse(err), 400);
    }
    throw err;
  }

  const db = c.env.DB;
  await enableForeignKeys(db);

  const statements: D1PreparedStatement[] = [
    db.prepare("DELETE FROM transactions"),
    db.prepare("DELETE FROM balances"),
    db.prepare("DELETE FROM people"),
  ];

  for (const person of doc.people) {
    statements.push(
      db
        .prepare(
          "INSERT INTO people (id, name, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        )
        .bind(
          person.id,
          person.name,
          person.note,
          person.createdAt,
          person.updatedAt,
        ),
    );
  }

  for (const balance of doc.balances) {
    statements.push(
      db
        .prepare(
          "INSERT INTO balances (id, person_id, label, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        )
        .bind(
          balance.id,
          balance.personId,
          balance.label,
          balance.createdAt,
          balance.updatedAt,
        ),
    );
  }

  for (const tx of doc.transactions) {
    statements.push(
      db
        .prepare(
          "INSERT INTO transactions (id, balance_id, type, amount, date, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(
          tx.id,
          tx.balanceId,
          tx.type,
          tx.amount,
          tx.date,
          tx.note,
          tx.createdAt,
          tx.updatedAt,
        ),
    );
  }

  await db.batch(statements);
  return c.json({ ok: true });
});

export default backup;
