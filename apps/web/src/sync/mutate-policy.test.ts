import { describe, expect, it } from 'vitest'
import { classifyMutate } from './mutate-policy'

describe('classifyMutate', () => {
  it.each([200, 201, 204])('treats %i as applied', (status) => {
    expect(classifyMutate(status)).toBe('ok')
  })

  it('queues a request that never reached the server', () => {
    expect(classifyMutate(0)).toBe('queue')
  })

  it.each([408, 429, 500, 502, 503, 504])(
    'queues %i because it may succeed later',
    (status) => {
      expect(classifyMutate(status)).toBe('queue')
    },
  )

  it('sends 401 to the auth path', () => {
    expect(classifyMutate(401)).toBe('auth')
  })

  it.each([400, 403, 404, 409, 422])(
    'surfaces %i immediately rather than queueing it',
    (status) => {
      expect(classifyMutate(status)).toBe('error')
    },
  )
})
