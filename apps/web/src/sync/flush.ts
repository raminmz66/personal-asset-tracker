import { getFailed, getOutbox, setFailed, setOutbox } from './cache'
import {
  applyFlushDecision,
  classifyFlush,
  type FlushDecision,
} from './flush-policy'
import { type OutboxEntry } from './outbox'

export type FlushResult =
  | { ok: true; flushed: number; parked: number }
  | {
      ok: false
      reason: 'auth' | 'failed'
      flushed: number
      parked: number
      status: number
    }

async function sendEntry(entry: OutboxEntry): Promise<Response> {
  const init: RequestInit = {
    method: entry.method,
    credentials: 'include',
  }

  if (entry.body !== undefined && entry.body !== null) {
    init.headers = { 'Content-Type': 'application/json' }
    init.body = JSON.stringify(entry.body)
  }

  return fetch(`/api${entry.path}`, init)
}

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string }
    return body.error ?? 'request_failed'
  } catch {
    return 'request_failed'
  }
}

/**
 * Drains the outbox, setting aside entries that can never succeed.
 *
 * Only `retry` and `auth` stop the drain. Anything else advances the head, so
 * one dead write no longer blocks every change made after it.
 */
export async function flushOutbox(): Promise<FlushResult> {
  let flushed = 0
  let parked = 0

  while (true) {
    const queue = await getOutbox()
    if (!queue[0]) {
      return { ok: true, flushed, parked }
    }

    let decision: FlushDecision
    let status = 0
    let error = 'offline'

    try {
      const res = await sendEntry(queue[0])
      status = res.status
      decision = classifyFlush(status, queue[0].method)
      if (decision === 'park') {
        error = await readError(res)
      }
    } catch {
      // Never reached the server; keep the entry and try again later.
      decision = 'retry'
    }

    const step = applyFlushDecision(
      { queue, failed: await getFailed() },
      decision,
      { status, error, failedAt: new Date().toISOString() },
    )

    if (step.stop) {
      const reason = decision === 'auth' ? 'auth' : 'failed'
      return { ok: false, reason, flushed, parked, status }
    }

    await setOutbox(step.queue)
    if (decision === 'park') {
      await setFailed(step.failed)
      parked += 1
    } else {
      flushed += 1
    }
  }
}
