export type OutboxEntry = {
  id: string
  method: string
  path: string
  body: unknown
}

export function enqueue(queue: OutboxEntry[], entry: OutboxEntry): OutboxEntry[] {
  return [...queue, entry]
}

export function peekAll(queue: OutboxEntry[]): OutboxEntry[] {
  return [...queue]
}

export function removeHead(queue: OutboxEntry[]): OutboxEntry[] {
  return queue.slice(1)
}
