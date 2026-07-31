import { Hono } from "hono";
import {
  balanceQuantity,
  isBalanceActive,
  ValidationError,
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
};

type TransactionRow = {
  balance_id: string;
  type: "deposit" | "return";
  amount: number;
};

type PersonWithCount = Person & { activeBalanceCount: number };

const people = new Hono<{ Bindings: Bindings }>();

people.use("*", requireAuth);

function rowToPerson(row: PersonRow): Person {
  return {
    id: row.id,
    name: row.name,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseName(value: unknown): string {
  if (typeof value !== "string") {
    throw new ValidationError("invalid_name", "نام الزامی است");
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new ValidationError("invalid_name", "نام الزامی است");
  }
  return trimmed;
}

function validationResponse(err: ValidationError) {
  return { error: err.code };
}

async function fetchPeopleRows(db: D1Database): Promise<PersonRow[]> {
  const result = await db
    .prepare(
      "SELECT id, name, note, created_at, updated_at FROM people ORDER BY name COLLATE NOCASE",
    )
    .all<PersonRow>();
  return result.results ?? [];
}

async function fetchPersonRow(
  db: D1Database,
  id: string,
): Promise<PersonRow | null> {
  return db
    .prepare(
      "SELECT id, name, note, created_at, updated_at FROM people WHERE id = ?",
    )
    .bind(id)
    .first<PersonRow>();
}

async function activeBalanceCountsByPersonId(
  db: D1Database,
  personIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (const personId of personIds) counts.set(personId, 0);
  if (personIds.length === 0) return counts;

  const placeholders = personIds.map(() => "?").join(", ");
  const balancesResult = await db
    .prepare(
      `SELECT id, person_id FROM balances WHERE person_id IN (${placeholders})`,
    )
    .bind(...personIds)
    .all<BalanceRow>();
  const balances = balancesResult.results ?? [];
  if (balances.length === 0) return counts;

  const balanceIds = balances.map((b) => b.id);
  const balancePlaceholders = balanceIds.map(() => "?").join(", ");
  const txResult = await db
    .prepare(
      `SELECT balance_id, type, amount FROM transactions WHERE balance_id IN (${balancePlaceholders})`,
    )
    .bind(...balanceIds)
    .all<TransactionRow>();

  const txsByBalance = new Map<string, Transaction[]>();
  for (const row of txResult.results ?? []) {
    const txs = txsByBalance.get(row.balance_id) ?? [];
    txs.push({
      id: "",
      balanceId: row.balance_id,
      type: row.type,
      amount: row.amount,
      date: "",
      note: null,
      createdAt: "",
      updatedAt: "",
    });
    txsByBalance.set(row.balance_id, txs);
  }

  for (const balance of balances) {
    const qty = balanceQuantity(txsByBalance.get(balance.id) ?? []);
    if (isBalanceActive(qty)) {
      counts.set(balance.person_id, (counts.get(balance.person_id) ?? 0) + 1);
    }
  }

  return counts;
}

async function personWithActiveBalanceCount(
  db: D1Database,
  row: PersonRow,
): Promise<PersonWithCount> {
  const counts = await activeBalanceCountsByPersonId(db, [row.id]);
  return {
    ...rowToPerson(row),
    activeBalanceCount: counts.get(row.id) ?? 0,
  };
}

people.get("/", async (c) => {
  const rows = await fetchPeopleRows(c.env.DB);
  const counts = await activeBalanceCountsByPersonId(
    c.env.DB,
    rows.map((row) => row.id),
  );
  const result: PersonWithCount[] = rows.map((row) => ({
    ...rowToPerson(row),
    activeBalanceCount: counts.get(row.id) ?? 0,
  }));
  return c.json(result);
});

people.post("/", async (c) => {
  let body: { name?: unknown; note?: unknown };
  try {
    body = await c.req.json<{ name?: unknown; note?: unknown }>();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  let name: string;
  try {
    name = parseName(body.name);
  } catch (err) {
    if (err instanceof ValidationError) {
      return c.json(validationResponse(err), 400);
    }
    throw err;
  }

  const note =
    body.note === undefined || body.note === null
      ? null
      : typeof body.note === "string"
        ? body.note
        : null;

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await enableForeignKeys(c.env.DB);
  await c.env.DB.prepare(
    "INSERT INTO people (id, name, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(id, name, note, now, now)
    .run();

  return c.json(
    await personWithActiveBalanceCount(c.env.DB, {
      id,
      name,
      note,
      created_at: now,
      updated_at: now,
    }),
    201,
  );
});

people.get("/:id", async (c) => {
  const row = await fetchPersonRow(c.env.DB, c.req.param("id"));
  if (!row) {
    return c.json({ error: "not_found" }, 404);
  }
  return c.json(await personWithActiveBalanceCount(c.env.DB, row));
});

people.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const existing = await fetchPersonRow(c.env.DB, id);
  if (!existing) {
    return c.json({ error: "not_found" }, 404);
  }

  let body: { name?: unknown; note?: unknown };
  try {
    body = await c.req.json<{ name?: unknown; note?: unknown }>();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  let name = existing.name;
  if (body.name !== undefined) {
    try {
      name = parseName(body.name);
    } catch (err) {
      if (err instanceof ValidationError) {
        return c.json(validationResponse(err), 400);
      }
      throw err;
    }
  }

  let note = existing.note;
  if (body.note !== undefined) {
    note =
      body.note === null
        ? null
        : typeof body.note === "string"
          ? body.note
          : existing.note;
  }

  const updatedAt = new Date().toISOString();
  await enableForeignKeys(c.env.DB);
  await c.env.DB.prepare(
    "UPDATE people SET name = ?, note = ?, updated_at = ? WHERE id = ?",
  )
    .bind(name, note, updatedAt, id)
    .run();

  return c.json(
    await personWithActiveBalanceCount(c.env.DB, {
      ...existing,
      name,
      note,
      updated_at: updatedAt,
    }),
  );
});

people.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const existing = await fetchPersonRow(c.env.DB, id);
  if (!existing) {
    return c.json({ error: "not_found" }, 404);
  }

  await enableForeignKeys(c.env.DB);
  await c.env.DB.prepare("DELETE FROM people WHERE id = ?").bind(id).run();
  return c.json({ ok: true });
});

export default people;
