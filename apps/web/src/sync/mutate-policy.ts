export type MutateDecision = 'ok' | 'queue' | 'auth' | 'error'

/**
 * What to do with the server's answer to a write.
 *
 * `queue` covers everything that might succeed later: the request never
 * arrived, or the server is too busy or broken to answer properly. Retrying is
 * safe because creates carry a client-minted id, so a write that actually did
 * land comes back as the existing row rather than a duplicate.
 *
 * A 4xx that is not 401 will never succeed however often it is retried, so it
 * surfaces immediately as an error rather than sitting in the queue.
 */
export function classifyMutate(status: number): MutateDecision {
  if (status === 0) return 'queue'
  if (status === 401) return 'auth'
  if (status === 408 || status === 429) return 'queue'
  if (status >= 500) return 'queue'
  if (status >= 400) return 'error'
  return 'ok'
}
