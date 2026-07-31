import type { Balance, Person, Transaction } from '@pat/domain'

export type AuthStatus = {
  setupRequired: boolean
  authenticated: boolean
}

export type PersonWithCount = Person & { activeBalanceCount: number }

export type BalanceWithQuantity = Balance & { quantity: number }

export type BalanceDetail = BalanceWithQuantity & { transactions: Transaction[] }

type ApiError = { error: string }

type FetchResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string }

async function parseError(res: Response): Promise<string> {
  let error = 'request_failed'
  try {
    const body = (await res.json()) as ApiError
    if (body.error) error = body.error
  } catch {
    /* empty body */
  }
  return error
}

async function authFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<FetchResult<T>> {
  const res = await fetch(`/api/auth${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })

  if (res.ok) {
    const data = (await res.json()) as T
    return { ok: true, data }
  }

  return { ok: false, status: res.status, error: await parseError(res) }
}

async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<FetchResult<T>> {
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    ...init,
  })

  if (res.ok) {
    const data = (await res.json()) as T
    return { ok: true, data }
  }

  return { ok: false, status: res.status, error: await parseError(res) }
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

  people: {
    list: () => apiFetch<PersonWithCount[]>('/people'),

    get: (id: string) => apiFetch<PersonWithCount>(`/people/${id}`),

    create: (name: string, note?: string | null) =>
      apiFetch<PersonWithCount>('/people', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, note: note ?? null }),
      }),

    update: (
      id: string,
      patch: { name?: string; note?: string | null },
    ) =>
      apiFetch<PersonWithCount>(`/people/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      }),

    delete: (id: string) =>
      apiFetch<{ ok: true }>(`/people/${id}`, { method: 'DELETE' }),
  },

  balances: {
    listForPerson: (
      personId: string,
      filter: 'active' | 'settled' | 'all' = 'active',
    ) =>
      apiFetch<BalanceWithQuantity[]>(
        `/people/${personId}/balances?filter=${filter}`,
      ),

    createWithDeposit: (
      personId: string,
      body: { label: string; amount: number; date: string; note?: string | null },
    ) =>
      apiFetch<BalanceWithQuantity>(`/people/${personId}/balances`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),

    get: (id: string) => apiFetch<BalanceDetail>(`/balances/${id}`),

    delete: (id: string) =>
      apiFetch<{ ok: true }>(`/balances/${id}`, { method: 'DELETE' }),
  },
}
