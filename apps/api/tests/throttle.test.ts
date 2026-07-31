import { describe, expect, it } from "vitest";
import {
  afterFailure,
  CLEARED_STATE,
  evaluateThrottle,
  LOCK_DURATION_MS,
  MAX_FAILURES,
} from "../src/throttle";

const NOW = Date.UTC(2026, 6, 1);

describe("evaluateThrottle", () => {
  it("treats the cleared state as unlocked", () => {
    expect(evaluateThrottle(CLEARED_STATE, NOW)).toEqual({
      locked: false,
      retryAfterSeconds: 0,
    });
  });

  it("is never locked without a lock timestamp", () => {
    expect(
      evaluateThrottle({ failedCount: 99, lockedUntilMs: null }, NOW).locked,
    ).toBe(false);
  });

  it("reports the remaining whole seconds, rounded up", () => {
    const state = { failedCount: 0, lockedUntilMs: NOW + 61_500 };
    expect(evaluateThrottle(state, NOW)).toEqual({
      locked: true,
      retryAfterSeconds: 62,
    });
  });

  it("unlocks once the window passes", () => {
    const state = { failedCount: 0, lockedUntilMs: NOW + 1000 };
    expect(evaluateThrottle(state, NOW + 1001).locked).toBe(false);
  });
});

describe("afterFailure", () => {
  it("does not lock before the limit", () => {
    let state = CLEARED_STATE;
    for (let i = 0; i < MAX_FAILURES - 1; i++) {
      state = afterFailure(state, NOW);
      expect(evaluateThrottle(state, NOW).locked).toBe(false);
    }
    expect(state.failedCount).toBe(MAX_FAILURES - 1);
  });

  it("locks on the final allowed failure", () => {
    let state = CLEARED_STATE;
    for (let i = 0; i < MAX_FAILURES; i++) state = afterFailure(state, NOW);

    const verdict = evaluateThrottle(state, NOW);
    expect(verdict.locked).toBe(true);
    expect(verdict.retryAfterSeconds).toBe(LOCK_DURATION_MS / 1000);
    // Counter resets so the next lock needs another full run of failures.
    expect(state.failedCount).toBe(0);
    expect(state.lockedUntilMs).toBe(NOW + LOCK_DURATION_MS);
  });

  it("needs another full run of failures to lock again", () => {
    let state = CLEARED_STATE;
    for (let i = 0; i < MAX_FAILURES; i++) state = afterFailure(state, NOW);
    const later = NOW + LOCK_DURATION_MS + 1;
    state = afterFailure(state, later);
    expect(evaluateThrottle(state, later).locked).toBe(false);
  });
});
