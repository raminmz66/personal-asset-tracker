export type AuthStatus = {
  setupRequired: boolean
  authenticated: boolean
}

type ApiError = { error: string }

async function authFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<{ ok: true; data: T } | { ok: false; status: number; error: string }> {
  const res = await fetch(`/api/auth${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })

  if (res.ok) {
    const data = (await res.json()) as T
    return { ok: true, data }
  }

  let error = 'request_failed'
  try {
    const body = (await res.json()) as ApiError
    if (body.error) error = body.error
  } catch {
    /* empty body */
  }
  return { ok: false, status: res.status, error }
}

export const api = {
  status: () => authFetch<AuthStatus>('/status'),

  setup: (password: string) =>
    authFetch<{ ok: true }>('/setup', {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),

  login: (password: string) =>
    authFetch<{ ok: true }>('/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),

  logout: () =>
    authFetch<{ ok: true }>('/logout', {
      method: 'POST',
    }),
}
