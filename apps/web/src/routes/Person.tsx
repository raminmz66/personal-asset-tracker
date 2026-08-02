import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import type { Balance, Transaction } from '@pat/domain'
import { AmountField } from '../components/AmountField'
import { BackButton } from '../components/BackButton'
import { BalanceRow } from '../components/BalanceRow'
import { ConfirmPress } from '../components/ConfirmPress'
import { SyncBanner } from '../components/SyncBanner'
import { parseJalaliToGregorian, todayJalali } from '../dates/jalali'
import { parseAmountInput } from '../format/digits'
import { JalaliDateField } from '../components/JalaliDateField'
import { getSnapshot, setSnapshot } from '../sync/cache'
import {
  activeBalancesForPerson,
  personFromSnapshot,
  removePersonFromSnapshot,
  settledBalancesForPerson,
  type BalanceListItem,
} from '../sync/snapshot-utils'
import { useSync } from '../sync/SyncContext'

export function Person() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { refresh, mutate } = useSync()
  const [name, setName] = useState<string | null>(null)
  const [balances, setBalances] = useState<BalanceListItem[]>([])
  const [settledCount, setSettledCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [label, setLabel] = useState('')
  const [amount, setAmount] = useState('')
  const [jalaliDate, setJalaliDate] = useState(todayJalali)
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadPerson = useCallback(async () => {
    if (!id) return
    const snapshot = await getSnapshot()
    if (!snapshot) {
      setName(null)
      setBalances([])
      setSettledCount(0)
      return
    }
    const person = personFromSnapshot(snapshot, id)
    setName(person?.name ?? null)
    setBalances(activeBalancesForPerson(snapshot, id))
    setSettledCount(settledBalancesForPerson(snapshot, id).length)
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
    const parsedAmount = parseAmountInput(amount)
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

    const balanceId = crypto.randomUUID()
    const txId = crypto.randomUUID()

    try {
      const result = await mutate({
        method: 'POST',
        path: `/people/${id}/balances`,
        body: {
          id: balanceId,
          txId,
          label: trimmedLabel,
          amount: parsedAmount,
          date: gregorianDate,
        },
      })

      if (result.queued) {
        const now = new Date().toISOString()
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

  async function handleDeletePerson() {
    if (!id) return
    setError(null)
    setDeleting(true)

    try {
      const result = await mutate({ method: 'DELETE', path: `/people/${id}` })

      if (result.queued) {
        const snapshot = await getSnapshot()
        if (snapshot) {
          await setSnapshot({
            ...removePersonFromSnapshot(snapshot, id),
            updatedAt: new Date().toISOString(),
          })
        }
      }

      // `replace` keeps the deleted person's URL out of forward history, so
      // BackButton cannot land on a person that no longer exists.
      navigate('/', { replace: true })
    } catch {
      setError('حذف شخص نشد.')
      setDeleting(false)
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
        <BackButton fallbackTo="/" />
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
                <AmountField
                  className="person-add-input"
                  value={amount}
                  onChange={setAmount}
                  placeholder="مبلغ"
                  disabled={submitting}
                  required
                />
                <JalaliDateField
                  value={jalaliDate}
                  onChange={setJalaliDate}
                  disabled={submitting}
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
                    amount={balance.quantity}
                  />
                ))}
              </div>
            )}

            <Link to={`/people/${id}/settled`} className="person-settled">
              تسویه‌شده‌ها
            </Link>

            {balances.length > 0 ? (
              <p className="person-delete-hint">
                برای حذف، اول موجودی‌ها را تسویه کن
              </p>
            ) : (
              <ConfirmPress
                label="حذف شخص"
                confirmLabel={
                  settledCount > 0
                    ? `${settledCount.toLocaleString('fa-IR')} موجودی تسویه‌شده حذف شود؟`
                    : 'مطمئنی؟ دوباره بزن'
                }
                onConfirm={handleDeletePerson}
                disabled={deleting}
                className="person-delete"
              />
            )}
          </>
        )}
      </div>

      <footer className="person-cap">
        {`${balances.length.toLocaleString('fa-IR')} موجودی فعال`}
      </footer>
    </div>
  )
}
