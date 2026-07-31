export const MAX_FAILURES = 5;
export const LOCK_DURATION_MS = 15 * 60 * 1000;

const ROW_ID = "global";

export type ThrottleState = {
  failedCount: number;
  lockedUntilMs: number | null;
};

export const CLEARED_STATE: ThrottleState = {
  failedCount: 0,
  lockedUntilMs: null,
};

export function evaluateThrottle(
  state: ThrottleState,
  nowMs: number,
): { locked: boolean; retryAfterSeconds: number } {
  if (state.lockedUntilMs === null || state.lockedUntilMs <= nowMs) {
    return { locked: false, retryAfterSeconds: 0 };
  }
  return {
    locked: true,
    retryAfterSeconds: Math.ceil((state.lockedUntilMs - nowMs) / 1000),
  };
}

export function afterFailure(
  state: ThrottleState,
  nowMs: number,
): ThrottleState {
  const failedCount = state.failedCount + 1;
  if (failedCount >= MAX_FAILURES) {
    // Reset the counter as the lock lands, so re-locking needs a fresh run.
    return { failedCount: 0, lockedUntilMs: nowMs + LOCK_DURATION_MS };
  }
  return { failedCount, lockedUntilMs: state.lockedUntilMs };
}

export async function loadThrottle(db: D1Database): Promise<ThrottleState> {
  const row = await db
    .prepare("SELECT failed_count, locked_until FROM auth_throttle WHERE id = ?")
    .bind(ROW_ID)
    .first<{ failed_count: number; locked_until: string | null }>();
  if (!row) return CLEARED_STATE;

  const parsed = row.locked_until ? Date.parse(row.locked_until) : NaN;
  return {
    failedCount: row.failed_count,
    lockedUntilMs: Number.isFinite(parsed) ? parsed : null,
  };
}

export async function saveThrottle(
  db: D1Database,
  state: ThrottleState,
): Promise<void> {
  const lockedUntil =
    state.lockedUntilMs === null
      ? null
      : new Date(state.lockedUntilMs).toISOString();
  await db
    .prepare(
      `INSERT INTO auth_throttle (id, failed_count, locked_until)
       VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         failed_count = excluded.failed_count,
         locked_until = excluded.locked_until`,
    )
    .bind(ROW_ID, state.failedCount, lockedUntil)
    .run();
}
