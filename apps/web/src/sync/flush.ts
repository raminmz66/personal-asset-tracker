import { getOutbox, setOutbox } from './cache'
import { peekAll, removeHead, type OutboxEntry } from './outbox'

export type FlushResult =
  | { ok: true; flushed: number }
  | { ok: false; reason: 'auth' | 'failed'; flushed: number; status: number }

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

export async function flushOutbox(): Promise<FlushResult> {
  let flushed = 0

  while (true) {
    const queue = await getOutbox()
    const head = peekAll(queue)[0]
    if (!head) {
      return { ok: true, flushed }
    }

    let res: Response
    try {
      res = await sendEntry(head)
    } catch {
      return { ok: false, reason: 'failed', flushed, status: 0 }
    }

    if (res.status === 401) {
      return { ok: false, reason: 'auth', flushed, status: 401 }
    }

    if (!res.ok) {
      return { ok: false, reason: 'failed', flushed, status: res.status }
    }

    await setOutbox(removeHead(queue))
    flushed += 1
  }
}
