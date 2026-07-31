/** Enable SQLite foreign-key enforcement for write operations. */
export async function enableForeignKeys(db: D1Database): Promise<void> {
  await db.exec("PRAGMA foreign_keys = ON");
}
