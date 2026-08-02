import { SESSION_TTL_MS } from '@pat/domain'
import { deleteKv, getKv, SESSION_KEY, setKv } from '../sync/cache'

/**
 * A record that this device was signed in recently.
 *
 * It is NOT a credential: it holds no token and grants nothing to the server,
 * which still checks the HttpOnly session cookie on every request. Its only
 * job is to let the UI decide what to render while the server is unreachable —
 * the cached ledger, or a screen telling you to get online.
 */
export type LocalSession = { expiresAt: string }

/** Expiry is exclusive: a session that expires exactly now is over. */
export function isSessionValid(
  session: LocalSession | undefined,
  now: Date,
): boolean {
  if (!session) return false
  const expiry = Date.parse(session.expiresAt)
  if (Number.isNaN(expiry)) return false
  return expiry > now.getTime()
}

export function getLocalSession(): Promise<LocalSession | undefined> {
  return getKv<LocalSession>(SESSION_KEY)
}

export function setLocalSession(now: Date): Promise<void> {
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS).toISOString()
  return setKv(SESSION_KEY, { expiresAt } satisfies LocalSession)
}

export function clearLocalSession(): Promise<void> {
  return deleteKv(SESSION_KEY)
}
