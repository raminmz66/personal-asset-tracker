import type { Person, Balance, Transaction, ExportDoc } from "./types";
import { ValidationError } from "./validate";

export const EXPORT_SCHEMA_VERSION = 1 as const;

export function buildExportDoc(
  people: Person[],
  balances: Balance[],
  transactions: Transaction[],
): ExportDoc {
  return {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    people,
    balances,
    transactions,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(obj: Record<string, unknown>, key: string, path: string): string {
  const value = obj[key];
  if (typeof value !== "string") {
    throw new ValidationError("invalid_export", `${path}.${key} must be a string`);
  }
  return value;
}

function requireNullableString(
  obj: Record<string, unknown>,
  key: string,
  path: string,
): string | null {
  const value = obj[key];
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new ValidationError("invalid_export", `${path}.${key} must be a string or null`);
  }
  return value;
}

function requireNumber(obj: Record<string, unknown>, key: string, path: string): number {
  const value = obj[key];
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new ValidationError("invalid_export", `${path}.${key} must be a number`);
  }
  return value;
}

function parsePerson(raw: unknown, index: number): Person {
  if (!isRecord(raw)) {
    throw new ValidationError("invalid_export", `people[${index}] must be an object`);
  }
  const path = `people[${index}]`;
  return {
    id: requireString(raw, "id", path),
    name: requireString(raw, "name", path),
    note: requireNullableString(raw, "note", path),
    createdAt: requireString(raw, "createdAt", path),
    updatedAt: requireString(raw, "updatedAt", path),
  };
}

function parseBalance(raw: unknown, index: number): Balance {
  if (!isRecord(raw)) {
    throw new ValidationError("invalid_export", `balances[${index}] must be an object`);
  }
  const path = `balances[${index}]`;
  return {
    id: requireString(raw, "id", path),
    personId: requireString(raw, "personId", path),
    label: requireString(raw, "label", path),
    createdAt: requireString(raw, "createdAt", path),
    updatedAt: requireString(raw, "updatedAt", path),
  };
}

function parseTransaction(raw: unknown, index: number): Transaction {
  if (!isRecord(raw)) {
    throw new ValidationError("invalid_export", `transactions[${index}] must be an object`);
  }
  const path = `transactions[${index}]`;
  const type = requireString(raw, "type", path);
  if (type !== "deposit" && type !== "return") {
    throw new ValidationError(
      "invalid_export",
      `${path}.type must be "deposit" or "return"`,
    );
  }
  return {
    id: requireString(raw, "id", path),
    balanceId: requireString(raw, "balanceId", path),
    type,
    amount: requireNumber(raw, "amount", path),
    date: requireString(raw, "date", path),
    note: requireNullableString(raw, "note", path),
    createdAt: requireString(raw, "createdAt", path),
    updatedAt: requireString(raw, "updatedAt", path),
  };
}

function requireArray(value: unknown, key: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ValidationError("invalid_export", `${key} must be an array`);
  }
  return value;
}

export function parseExportDoc(raw: unknown): ExportDoc {
  if (!isRecord(raw)) {
    throw new ValidationError("invalid_export", "export document must be an object");
  }

  if (raw.schemaVersion !== EXPORT_SCHEMA_VERSION) {
    throw new ValidationError(
      "invalid_export",
      `unsupported schemaVersion: ${String(raw.schemaVersion)}`,
    );
  }

  const exportedAt = requireString(raw, "exportedAt", "export");
  const peopleRaw = requireArray(raw.people, "people");
  const balancesRaw = requireArray(raw.balances, "balances");
  const transactionsRaw = requireArray(raw.transactions, "transactions");

  return {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt,
    people: peopleRaw.map(parsePerson),
    balances: balancesRaw.map(parseBalance),
    transactions: transactionsRaw.map(parseTransaction),
  };
}
