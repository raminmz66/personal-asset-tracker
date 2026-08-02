import type { OutboxEntry } from './outbox'

export type FlushDecision = 'drop' | 'retry' | 'park' | 'auth'

export type FailedEntry = OutboxEntry & {
  status: number
  error: string
  failedAt: string
}

/**
 * What to do with a queued write after the server has answered.
 *
 * `park` is the one that matters: an entry that can never succeed is moved
 * aside so the rest of the queue keeps draining. Returning without advancing
 * the head — the old behaviour — jammed every later change behind it forever.
 */
export function classifyFlush(status: number, method: string): FlushDecision {
  if (status >= 200 && status < 300) return 'drop'
  if (status === 401) return 'auth'

  // The row is already gone, which is exactly what this entry wanted. Parking
  // it would demand attention for something that is already true.
  if (status === 404 && (method === 'DELETE' || method === 'PATCH')) {
    return 'drop'
  }

  if (status === 0 || status === 408 || status === 429) return 'retry'
  if (status >= 500) return 'retry'
  if (status >= 400) return 'park'
  return 'retry'
}

export type FlushState = {
  queue: OutboxEntry[]
  failed: FailedEntry[]
}

export type FlushStep = FlushState & { stop: boolean }

/**
 * Applies one decision to the queue. Pure, so the drain loop's bookkeeping can
 * be tested without a network.
 */
export function applyFlushDecision(
  state: FlushState,
  decision: FlushDecision,
  meta: { status: number; error: string; failedAt: string },
): FlushStep {
  const [head, ...rest] = state.queue

  if (!head || decision === 'retry' || decision === 'auth') {
    return { ...state, stop: true }
  }

  if (decision === 'park') {
    return {
      queue: rest,
      failed: [...state.failed, { ...head, ...meta }],
      stop: false,
    }
  }

  return { queue: rest, failed: state.failed, stop: false }
}
