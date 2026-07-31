import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { BackButton } from '../components/BackButton'
import { BalanceRow } from '../components/BalanceRow'
import { SyncBanner } from '../components/SyncBanner'
import { getSnapshot } from '../sync/cache'
import {
  personFromSnapshot,
  settledBalancesForPerson,
  type BalanceListItem,
} from '../sync/snapshot-utils'
import { useSync } from '../sync/SyncContext'

export function Settled() {
  const { id } = useParams<{ id: string }>()
  const { refresh } = useSync()
  const [name, setName] = useState<string | null>(null)
  const [balances, setBalances] = useState<BalanceListItem[]>([])
  const [loading, setLoading] = useState(true)

  const loadSettled = useCallback(async () => {
    if (!id) return
    const snapshot = await getSnapshot()
    if (!snapshot) {
      setName(null)
      setBalances([])
      return
    }
    const person = personFromSnapshot(snapshot, id)
    setName(person?.name ?? null)
    setBalances(settledBalancesForPerson(snapshot, id))
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
        await loadSettled()
        setLoading(false)
      }
    }

    void init()
    return () => {
      cancelled = true
    }
  }, [refresh, loadSettled])

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
        <BackButton fallbackTo={`/people/${id}`} />
        <h1 className="person-title">تسویه‌شده‌ها</h1>
        <span aria-hidden="true" />
      </header>

      <div className="person-body">
        {loading ? (
          <p className="person-muted">در حال بارگذاری…</p>
        ) : name === null ? (
          <p className="person-muted">شخص یافت نشد.</p>
        ) : balances.length === 0 ? (
          <p className="person-muted">چیزی تو تسویه‌شده‌ها نیست</p>
        ) : (
          <>
            <div className="person-sec">
              <span>{name}</span>
            </div>
            <div className="person-list person-list--settled">
              {balances.map((balance) => (
                <BalanceRow
                  key={balance.id}
                  id={balance.id}
                  label={balance.label}
                  amount={balance.deposited}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <footer className="person-cap">
        {`${balances.length.toLocaleString('fa-IR')} تسویه‌شده`}
      </footer>
    </div>
  )
}
