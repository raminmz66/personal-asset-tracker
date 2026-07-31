import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import type { Person } from '@pat/domain'
import { PersonRow } from '../components/PersonRow'
import { SyncBanner } from '../components/SyncBanner'
import { getSnapshot, setSnapshot } from '../sync/cache'
import { peopleFromSnapshot, type PersonListItem } from '../sync/snapshot-utils'
import { useSync } from '../sync/SyncContext'

export function Home() {
  const { online, refresh, mutate } = useSync()
  const [people, setPeople] = useState<PersonListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadPeople = useCallback(async () => {
    const snapshot = await getSnapshot()
    if (snapshot) {
      setPeople(peopleFromSnapshot(snapshot))
    } else {
      setPeople([])
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function init() {
      try {
        await refresh()
      } catch {
        /* use cached snapshot when refresh fails offline */
      }
      if (!cancelled) {
        await loadPeople()
        setLoading(false)
      }
    }

    void init()
    return () => {
      cancelled = true
    }
  }, [refresh, loadPeople])

  async function handleAddPerson(e: FormEvent) {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return

    setError(null)
    setSubmitting(true)

    try {
      await mutate({ method: 'POST', path: '/people', body: { name } })

      if (!online) {
        const now = new Date().toISOString()
        const person: Person = {
          id: crypto.randomUUID(),
          name,
          note: null,
          createdAt: now,
          updatedAt: now,
        }
        const snapshot = await getSnapshot()
        await setSnapshot({
          people: [...(snapshot?.people ?? []), person],
          balances: snapshot?.balances ?? [],
          transactions: snapshot?.transactions ?? [],
          updatedAt: now,
        })
      }

      await loadPeople()
      setNewName('')
      setAdding(false)
    } catch {
      setError('افزودن شخص نشد.')
    } finally {
      setSubmitting(false)
    }
  }

  const totalActive = people.reduce((sum, person) => sum + person.activeCount, 0)
  const homeCap = `${people.length.toLocaleString('fa-IR')} نفر · ${totalActive.toLocaleString('fa-IR')} موجودی فعال`

  return (
    <div className="home">
      <SyncBanner />

      <header className="home-bar">
        <span aria-hidden="true" />
        <h1 className="home-title">امانت‌ها</h1>
        <Link to="/settings" className="home-gear" aria-label="تنظیمات">
          ⚙
        </Link>
      </header>

      <div className="home-body">
        {loading ? (
          <p className="home-muted">در حال بارگذاری…</p>
        ) : people.length === 0 ? (
          <p className="home-empty">هنوز کسی اضافه نکردی</p>
        ) : (
          <div className="home-list">
            {people.map((person) => (
              <PersonRow
                key={person.id}
                id={person.id}
                name={person.name}
                activeCount={person.activeCount}
              />
            ))}
          </div>
        )}

        {adding ? (
          <form className="home-add-form" onSubmit={handleAddPerson}>
            <input
              className="home-add-input"
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="نام"
              autoFocus
              disabled={submitting}
              required
            />
            <div className="home-add-actions">
              <button
                type="submit"
                className="home-add-submit"
                disabled={submitting}
              >
                {submitting ? '…' : 'افزودن'}
              </button>
              <button
                type="button"
                className="home-add-cancel"
                onClick={() => {
                  setAdding(false)
                  setNewName('')
                  setError(null)
                }}
                disabled={submitting}
              >
                انصراف
              </button>
            </div>
            {error && <p className="home-add-error">{error}</p>}
          </form>
        ) : (
          <button
            type="button"
            className="home-add"
            onClick={() => setAdding(true)}
          >
            + افزودن شخص
          </button>
        )}
      </div>

      <footer className="home-cap">{homeCap}</footer>
    </div>
  )
}
