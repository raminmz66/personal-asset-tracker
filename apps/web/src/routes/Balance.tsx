import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router'
import type { Transaction } from '@pat/domain'
import {
  assertBalanceReturnAllowed,
  balanceQuantity,
  ValidationError,
} from '@pat/domain'
import { apiErrorMessage } from '../api/client'
import { BackButton } from '../components/BackButton'
import { SyncBanner } from '../components/SyncBanner'
import { ConfirmPress } from '../components/ConfirmPress'
import {
  TransactionForm,
  type TransactionFormValues,
} from '../components/TransactionForm'
import { formatJalali } from '../dates/jalali'
import { formatRelativeFa } from '../dates/relative-fa'
import { getSnapshot, setSnapshot } from '../sync/cache'
import {
  balanceDetailFromSnapshot,
  type BalanceDetailItem,
} from '../sync/snapshot-utils'
import { MutateError, useSync } from '../sync/SyncContext'

type FormMode = 'deposit' | 'return' | 'edit' | null

function formatAmount(value: number): string {
  return value.toLocaleString('fa-IR')
}

export function Balance() {
  const { id } = useParams<{ id: string }>()
  const { online, pendingCount, lastSyncedAt, refresh, mutate } = useSync()
  const [detail, setDetail] = useState<BalanceDetailItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [formMode, setFormMode] = useState<FormMode>(null)
  const [editingTx, setEditingTx] = useState<Transaction | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadBalance = useCallback(async () => {
    if (!id) return
    const snapshot = await getSnapshot()
    if (!snapshot) {
      setDetail(null)
      return
    }
    setDetail(balanceDetailFromSnapshot(snapshot, id))
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
        await loadBalance()
        setLoading(false)
      }
    }

    void init()
    return () => {
      cancelled = true
    }
  }, [refresh, loadBalance])

  function closeForm() {
    setFormMode(null)
    setEditingTx(null)
    setError(null)
  }

  function openForm(mode: 'deposit' | 'return') {
    setEditingTx(null)
    setFormMode(mode)
    setError(null)
  }

  function openEdit(tx: Transaction) {
    setEditingTx(tx)
    setFormMode('edit')
    setError(null)
  }

  async function applyOfflineTransaction(
    tx: Transaction,
    mode: 'create' | 'update' | 'delete',
    deletedId?: string,
  ) {
    const snapshot = await getSnapshot()
    if (!snapshot) return

    let transactions = snapshot.transactions
    if (mode === 'create') {
      transactions = [...transactions, tx]
    } else if (mode === 'update') {
      transactions = transactions.map((t) => (t.id === tx.id ? tx : t))
    } else if (deletedId) {
      transactions = transactions.filter((t) => t.id !== deletedId)
    }

    await setSnapshot({
      ...snapshot,
      transactions,
      updatedAt: new Date().toISOString(),
    })
  }

  async function handleSubmit(values: TransactionFormValues) {
    if (!id || !detail) return

    setError(null)
    setSubmitting(true)

    try {
      if (formMode === 'edit' && editingTx) {
        // Pre-flight, so it stays keyed on `online`: only when we know the
        // server is out of reach does the local snapshot become the authority
        // on over-return. Running it while we believe we are online could
        // reject a valid write from a stale snapshot.
        if (!online) {
          const snapshot = await getSnapshot()
          const txs = snapshot?.transactions.filter((t) => t.balanceId === id) ?? []
          const qty = balanceQuantity(
            txs.filter((t) => t.id !== editingTx.id),
          )
          if (values.type === 'return') {
            assertBalanceReturnAllowed(qty, values.amount)
          }
        }
        const result = await mutate({
          method: 'PATCH',
          path: `/transactions/${editingTx.id}`,
          body: values,
        })
        if (result.queued) {
          const now = new Date().toISOString()
          const updated: Transaction = {
            ...editingTx,
            type: values.type,
            amount: values.amount,
            date: values.date,
            note: values.note,
            updatedAt: now,
          }
          await applyOfflineTransaction(updated, 'update')
        }
      } else {
        // Pre-flight; see the note above.
        if (!online) {
          const snapshot = await getSnapshot()
          const txs = snapshot?.transactions.filter((t) => t.balanceId === id) ?? []
          const qty = balanceQuantity(txs)
          if (values.type === 'return') {
            assertBalanceReturnAllowed(qty, values.amount)
          }
        }
        const txId = crypto.randomUUID()
        const result = await mutate({
          method: 'POST',
          path: `/balances/${id}/transactions`,
          body: { id: txId, ...values },
        })
        if (result.queued) {
          const now = new Date().toISOString()
          const tx: Transaction = {
            id: txId,
            balanceId: id,
            type: values.type,
            amount: values.amount,
            date: values.date,
            note: values.note,
            createdAt: now,
            updatedAt: now,
          }
          await applyOfflineTransaction(tx, 'create')
        }
      }

      closeForm()
      await loadBalance()
    } catch (err) {
      if (err instanceof MutateError) {
        setError(apiErrorMessage(err.code))
      } else if (err instanceof ValidationError) {
        setError(apiErrorMessage(err.code))
      } else {
        setError('انجام نشد.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(tx: Transaction) {
    setSubmitting(true)
    setError(null)

    try {
      const result = await mutate({
        method: 'DELETE',
        path: `/transactions/${tx.id}`,
      })
      if (result.queued) {
        await applyOfflineTransaction(tx, 'delete', tx.id)
      }
      closeForm()
      await loadBalance()
    } catch {
      setError('حذف نشد.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!id) {
    return (
      <div className="balance">
        <p className="balance-muted">شناسه نامعتبر.</p>
      </div>
    )
  }

  const bannerVisible = !online || pendingCount > 0
  const balanceCap =
    bannerVisible || !lastSyncedAt
      ? ''
      : `همگام · ${formatRelativeFa(lastSyncedAt)}`

  return (
    <div className="balance">
      <SyncBanner />

      <header className="balance-bar">
        <BackButton fallbackTo={detail ? `/people/${detail.personId}` : '/'} />
        <h1 className="balance-title">
          {detail ? `${detail.personName} · ${detail.label}` : '…'}
        </h1>
        <span aria-hidden="true" />
      </header>

      <div className="balance-body">
        {loading ? (
          <p className="balance-muted">در حال بارگذاری…</p>
        ) : detail === null ? (
          <p className="balance-muted">موجودی یافت نشد.</p>
        ) : (
          <>
            <div className="balance-hero">
              <div className="balance-hero-label">مانده</div>
              <div className="balance-hero-num">
                {formatAmount(detail.quantity)}
              </div>
              {/* واریزی first: under direction:rtl the first grid child sits
                  on the right, matching the reading order in, then out. */}
              <dl className="balance-hero-totals">
                <div className="balance-hero-total">
                  <dt className="balance-hero-total-label">کل واریزی</dt>
                  <dd className="balance-hero-total-num">
                    {formatAmount(detail.deposited)}
                  </dd>
                </div>
                <div className="balance-hero-total">
                  <dt className="balance-hero-total-label">کل برگشتی</dt>
                  <dd className="balance-hero-total-num">
                    {formatAmount(detail.returned)}
                  </dd>
                </div>
              </dl>
            </div>

            {formMode ? (
              <TransactionForm
                mode={formMode}
                initialType={editingTx?.type}
                initialAmount={editingTx?.amount}
                initialDate={editingTx?.date}
                initialNote={editingTx?.note}
                submitting={submitting}
                error={error}
                onSubmit={(values) => void handleSubmit(values)}
                onCancel={closeForm}
              />
            ) : (
              <div className="balance-actions">
                <button
                  type="button"
                  className="balance-btn"
                  onClick={() => openForm('deposit')}
                >
                  واریز
                </button>
                <button
                  type="button"
                  className="balance-btn balance-btn--ghost"
                  onClick={() => openForm('return')}
                >
                  برگشت
                </button>
              </div>
            )}

            <div className="balance-sec">تاریخچه</div>

            {detail.transactions.length === 0 ? (
              <p className="balance-muted">تراکنشی ثبت نشده.</p>
            ) : (
              <div className="balance-history">
                {detail.transactions.map((tx) => (
                  <button
                    key={tx.id}
                    type="button"
                    className="balance-tx"
                    onClick={() => openEdit(tx)}
                    disabled={submitting}
                  >
                    <div>
                      {tx.type === 'deposit' ? 'واریز' : 'برگشت'}
                      <div className="balance-tx-date">{formatJalali(tx.date)}</div>
                    </div>
                    <span
                      className={
                        tx.type === 'deposit'
                          ? 'balance-tx-amt balance-tx-amt--plus'
                          : 'balance-tx-amt balance-tx-amt--minus'
                      }
                    >
                      {tx.type === 'deposit' ? '+' : '−'}
                      {formatAmount(tx.amount)}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {formMode === 'edit' && editingTx && (
              <ConfirmPress
                label="حذف تراکنش"
                confirmLabel="مطمئنی؟ دوباره بزن"
                onConfirm={() => void handleDelete(editingTx)}
                disabled={submitting}
                className="balance-delete"
              />
            )}
          </>
        )}
      </div>

      <footer className="balance-cap">{balanceCap}</footer>
    </div>
  )
}
