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

  changePassword: (currentPassword: string, newPassword: string) =>
    authFetch<{ ok: true }>('/password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),

  exportBackup: async (): Promise<FetchResult<Blob>> => {
    const res = await fetch('/api/backup/export', { credentials: 'include' })
    if (res.ok) {
      return { ok: true, data: await res.blob() }
    }
    return { ok: false, status: res.status, error: await parseError(res) }
  },

  importBackup: (doc: unknown) =>
    apiFetch<{ ok: true }>('/backup/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(doc),
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

  transactions: {
    create: (
      balanceId: string,
      body: {
        type: 'deposit' | 'return'
        amount: number
        date: string
        note?: string | null
      },
    ) =>
      apiFetch<Transaction>(`/balances/${balanceId}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),

    update: (
      id: string,
      patch: {
        type?: 'deposit' | 'return'
        amount?: number
        date?: string
        note?: string | null
      },
    ) =>
      apiFetch<Transaction>(`/transactions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      }),

    delete: (id: string) =>
      apiFetch<{ ok: true }>(`/transactions/${id}`, { method: 'DELETE' }),
  },
}

export const API_ERROR_MESSAGES: Record<string, string> = {
  over_return: 'برگشت نمی‌تواند از موجودی فعلی بیشتر باشد',
  invalid_amount: 'مبلغ باید بزرگ‌تر از صفر باشد',
  invalid_date: 'تاریخ نامعتبر است.',
  invalid_type: 'نوع تراکنش نامعتبر است.',
  invalid_credentials: 'رمز عبور اشتباه است.',
  invalid_json: 'فایل پشتیبان نامعتبر است.',
  invalid_export: 'فایل پشتیبان نامعتبر است.',
  request_failed: 'خطا در ارتباط با سرور.',
}

export function apiErrorMessage(code: string): string {
  return API_ERROR_MESSAGES[code] ?? 'عملیات ناموفق بود.'
}
