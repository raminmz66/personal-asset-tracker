import { describe, expect, it } from 'vitest'
import { enqueue, peekAll, removeHead, type OutboxEntry } from './outbox'

function entry(id: string): OutboxEntry {
  return { id, method: 'POST', path: `/items/${id}`, body: { id } }
}

describe('outbox', () => {
  it('enqueue preserves FIFO order', () => {
    let queue: OutboxEntry[] = []
    queue = enqueue(queue, entry('a'))
    queue = enqueue(queue, entry('b'))
    queue = enqueue(queue, entry('c'))

    expect(peekAll(queue).map((e) => e.id)).toEqual(['a', 'b', 'c'])
  })

  it('peekAll returns a copy without mutating the queue', () => {
    const queue = enqueue([], entry('a'))
    const peeked = peekAll(queue)

    peeked.push(entry('b'))
    expect(queue).toHaveLength(1)
    expect(peekAll(queue).map((e) => e.id)).toEqual(['a'])
  })

  it('removeHead drops the first entry in FIFO order', () => {
    let queue: OutboxEntry[] = []
    queue = enqueue(queue, entry('a'))
    queue = enqueue(queue, entry('b'))

    queue = removeHead(queue)
    expect(peekAll(queue).map((e) => e.id)).toEqual(['b'])

    queue = removeHead(queue)
    expect(peekAll(queue)).toEqual([])
  })
})
