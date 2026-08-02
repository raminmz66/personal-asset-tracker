const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * Use the client's id when it is a well-formed UUID v4, otherwise mint one.
 *
 * Letting the client choose is what makes creates idempotent: a queued write
 * that is retried after an ambiguous failure lands on the same row instead of
 * duplicating it. Rejecting anything that is not v4 keeps the id space
 * identical to what the server already produces, so nothing downstream has to
 * cope with a new id shape.
 */
export function resolveId(candidate: unknown): string {
  if (typeof candidate === "string") {
    const normalised = candidate.toLowerCase();
    if (UUID_V4.test(normalised)) return normalised;
  }
  return crypto.randomUUID();
}

/**
 * True when a D1 write failed because the row already exists — the signature
 * of a retried queue entry whose first attempt actually got through.
 */
export function isDuplicateKeyError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /UNIQUE constraint failed|PRIMARY KEY must be unique/i.test(message);
}
