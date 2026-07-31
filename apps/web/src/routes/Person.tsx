import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import type { Balance, Transaction } from '@pat/domain'
import { BalanceRow } from '../components/BalanceRow'
import { SyncBanner } from '../components/SyncBanner'
import { parseJalaliToGregorian, todayJalali } from '../dates/jalali'
import { getSnapshot, setSnapshot } from '../sync/cache'
import {
  activeBalancesForPerson,
  personFromSnapshot,
  type BalanceListItem,
} from '../sync/snapshot-utils'
import { useSync } from '../sync/SyncContext'

export function Person() {
  const { id } = useParams<{ id: string }>()
  const { online, refresh, mutate } = useSync()
  const [name, setName] = useState<string | null>(null)
  const [balances, setBalances] = useState<BalanceListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [label, setLabel] = useState('')
  const [amount, setAmount] = useState('')
  const [jalaliDate, setJalaliDate] = useState(todayJalali)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadPerson = useCallback(async () => {
    if (!id) return
    const snapshot = await getSnapshot()
    if (!snapshot) {
      setName(null)
      setBalances([])
      return
    }
    const person = personFromSnapshot(snapshot, id)
    setName(person?.name ?? null)
    setBalances(activeBalancesForPerson(snapshot, id))
  }, [id])

  useEffect(() => {
    let cancelled = false

    async function init() {
      try {
        await refresh()
      } catch {
        /* use cached snapshot when refresh fails offline */
      }
      if (!cancelled) {
        await loadPerson()
        setLoading(false)
      }
    }

    void init()
    return () => {
      cancelled = true
    }
  }, [refresh, loadPerson])

  async function handleAddBalance(e: FormEvent) {
    e.preventDefault()
    if (!id) return

    const trimmedLabel = label.trim()
    const parsedAmount = Number(amount.replace(/,/g, ''))
    const gregorianDate = parseJalaliToGregorian(jalaliDate)

    if (!trimmedLabel || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError('برچسب و مبلغ درست وارد کن.')
      return
    }
    if (!gregorianDate) {
      setError('تاریخ درست نیست.')
      return
    }

    setError(null)
    setSubmitting(true)

    try {
      await mutate({
        method: 'POST',
        path: `/people/${id}/balances`,
        body: { label: trimmedLabel, amount: parsedAmount, date: gregorianDate },
      })

      if (!online) {
        const now = new Date().toISOString()
        const balanceId = crypto.randomUUID()
        const txId = crypto.randomUUID()
        const balance: Balance = {
          id: balanceId,
          personId: id,
          label: trimmedLabel,
          createdAt: now,
          updatedAt: now,
        }
        const transaction: Transaction = {
          id: txId,
          balanceId,
          type: 'deposit',
          amount: parsedAmount,
          date: gregorianDate,
          note: null,
          createdAt: now,
          updatedAt: now,
        }
        const snapshot = await getSnapshot()
        await setSnapshot({
          people: snapshot?.people ?? [],
          balances: [...(snapshot?.balances ?? []), balance],
          transactions: [...(snapshot?.transactions ?? []), transaction],
          updatedAt: now,
        })
      }

      await loadPerson()
      setLabel('')
      setAmount('')
      setJalaliDate(todayJalali())
      setAdding(false)
    } catch {
      setError('افزودن موجودی نشد.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!id) {
    return (
      <div className="person">
        <p className="person-muted">شناسه نامعتبر.</p>
      </div>
    )
  }

  return (
    <div className="person">
      <SyncBanner />

      <header className="person-bar">
        <Link to="/" className="person-back" aria-label="بازگشت">
          ←
        </Link>
        <h1 className="person-title">{name ?? '…'}</h1>
        <span aria-hidden="true" />
      </header>

      <div className="person-body">
        {loading ? (
          <p className="person-muted">در حال بارگذاری…</p>
        ) : name === null ? (
          <p className="person-muted">شخص یافت نشد.</p>
        ) : (
          <>
            <div className="person-sec">
              <span>موجودی‌ها</span>
              {!adding && (
                <button
                  type="button"
                  className="person-link"
                  onClick={() => {
                    setAdding(true)
                    setJalaliDate(todayJalali())
                    setError(null)
                  }}
                >
                  + افزودن موجودی
                </button>
              )}
            </div>

            {adding ? (
              <form className="person-add-form" onSubmit={handleAddBalance}>
                <input
                  className="person-add-input"
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="برچسب (مثلاً تومان)"
                  autoFocus
                  disabled={submitting}
                  required
                />
                <input
                  className="person-add-input"
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="مبلغ"
                  disabled={submitting}
                  required
                />
                <input
                  className="person-add-input"
                  type="text"
                  value={jalaliDate}
                  onChange={(e) => setJalaliDate(e.target.value)}
                  placeholder="۱۴۰۴/۰۵/۱۰"
                  dir="ltr"
                  disabled={submitting}
                  required
                />
                <div className="person-add-actions">
                  <button
                    type="submit"
                    className="person-add-submit"
                    disabled={submitting}
                  >
                    {submitting ? '…' : 'افزودن'}
                  </button>
                  <button
                    type="button"
                    className="person-add-cancel"
                    onClick={() => {
                      setAdding(false)
                      setLabel('')
                      setAmount('')
                      setJalaliDate(todayJalali())
                      setError(null)
                    }}
                    disabled={submitting}
                  >
                    انصراف
                  </button>
                </div>
                {error && <p className="person-add-error">{error}</p>}
              </form>
            ) : balances.length === 0 ? (
              <p className="person-muted">موجودی فعالی نداری</p>
            ) : (
              <div className="person-list">
                {balances.map((balance) => (
                  <BalanceRow
                    key={balance.id}
                    id={balance.id}
                    label={balance.label}
                    quantity={balance.quantity}
                  />
                ))}
              </div>
            )}

            <Link to={`/people/${id}/settled`} className="person-settled">
              تسویه‌شده‌ها
            </Link>
          </>
        )}
      </div>

      <footer className="person-cap">
        {`${balances.length.toLocaleString('fa-IR')} موجودی فعال`}
      </footer>
    </div>
  )
}
