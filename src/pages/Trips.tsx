import type { ReactElement } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plane } from 'lucide-react'
import { filterTransactionsByVisibleAccounts, formatCurrencyAmount } from '@/lib/api'
import * as storage from '@/lib/storage'
import { buildTripSummaries } from '@/lib/insightsCommitments'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useRegisterNavScrollRoot } from '@/contexts/NavScrollContext'
import './Page.css'
import './Summary.css'

export function Trips(): ReactElement {
  const scrollRef = useRef<HTMLDivElement>(null)
  useRegisterNavScrollRoot(scrollRef)
  const [rev, setRev] = useState(0)
  const [bankRev, setBankRev] = useState(0)
  const [showNew, setShowNew] = useState(false)
  const [name, setName] = useState('')
  const [start, setStart] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  const [end, setEnd] = useState('')
  const [budget, setBudget] = useState('')

  useEffect(() => {
    const on = (): void => setRev((n) => n + 1)
    window.addEventListener(storage.TRIPS_CHANGED_EVENT, on)
    return () =>
      window.removeEventListener(storage.TRIPS_CHANGED_EVENT, on)
  }, [])

  useEffect(() => {
    const on = (): void => setBankRev((n) => n + 1)
    window.addEventListener(storage.BANK_SYNC_COMPLETED_EVENT, on)
    return () =>
      window.removeEventListener(storage.BANK_SYNC_COMPLETED_EVENT, on)
  }, [])

  useEffect(() => {
    void (async () => {
      const { fetchTripsFromServer } = await import('@/lib/serverData')
      const t = await fetchTripsFromServer()
      if (t) {
        storage.saveTrips(t)
        setRev((n) => n + 1)
      }
    })()
  }, [])

  const trips = useMemo(() => storage.getTrips(), [rev])
  const txs = useMemo(() => {
    void bankRev
    return filterTransactionsByVisibleAccounts(storage.getTransactions() ?? [])
  }, [bankRev, rev])

  const rows = useMemo(
    () => buildTripSummaries(txs, trips),
    [txs, trips],
  )

  async function createTrip(): Promise<void> {
    const n = name.trim()
    if (!n || start.length < 10) return
    let budgetLimit: number | null = null
    const b = budget.trim().replace(/[$,]/g, '')
    if (b !== '') {
      const x = Number(b)
      if (!Number.isFinite(x) || x < 0) return
      budgetLimit = Math.round(x * 100) / 100
    }
    const { createTripOnServer } = await import('@/lib/serverData')
    const created = await createTripOnServer({
      name: n,
      startDate: start,
      endDate: end.trim().length >= 10 ? end.slice(0, 10) : null,
      budgetLimit,
      color: null,
    })
    if (!created) return
    setName('')
    setEnd('')
    setBudget('')
    setShowNew(false)
    setRev((x) => x + 1)
  }

  return (
    <main className="page page--fill page--summary summary-root">
      <div className="summary-top">
        <div className="summary-head">
          <h1 className="page__title">Trips</h1>
          <div className="summary-head__trailing">
          </div>
        </div>
      </div>

      <div ref={scrollRef} className="summary-scroll space-y-3">
        <Button
          type="button"
          className="w-full"
          variant="secondary"
          onClick={() => setShowNew((v) => !v)}
        >
          {showNew ? 'Cancel' : 'New trip'}
        </Button>

        {showNew ? (
          <Card className="shadow-xs">
            <CardContent className="space-y-3 pt-4">
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-muted-foreground">Name</span>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Japan June 2026"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-muted-foreground">Start date</span>
                <Input
                  type="date"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-muted-foreground">End date (optional)</span>
                <Input
                  type="date"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-muted-foreground">Budget limit (optional)</span>
                <Input
                  inputMode="decimal"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                />
              </label>
              <Button
                type="button"
                className="w-full"
                disabled={!name.trim() || start.length < 10}
                onClick={() => void createTrip()}
              >
                Create trip
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {rows.length === 0 && !showNew ? (
          <Card className="border-dashed shadow-none" role="status">
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              No trips yet. Create one to group travel spending, or assign transactions from the
              Transactions tab.
            </CardContent>
          </Card>
        ) : null}

        {rows.map(({ trip, totalSpent, txCount }) => {
          const range =
            trip.endDate && trip.endDate >= trip.startDate
              ? `${trip.startDate} → ${trip.endDate}`
              : trip.startDate
          const cap = trip.budgetLimit
          const pct =
            cap !== null && cap > 0
              ? Math.min(100, (totalSpent / cap) * 100)
              : null

          return (
            <Link
              key={trip.id}
              to={`/app/trips/${trip.id}`}
              className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Card className="shadow-xs transition-colors hover:bg-muted/30">
                <CardContent className="space-y-2 pt-4">
                  <div className="flex items-start gap-2">
                    <Plane
                      className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium leading-tight">{trip.name}</div>
                      <div className="text-muted-foreground text-xs">{range}</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap justify-between gap-2 text-sm">
                    <span className="text-muted-foreground">
                      {txCount} transaction{txCount === 1 ? '' : 's'}
                    </span>
                    <span className="font-medium tabular-nums">
                      {formatCurrencyAmount(totalSpent)}
                    </span>
                  </div>
                  {cap !== null && cap > 0 ? (
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Budget</span>
                        <span className="tabular-nums">
                          {formatCurrencyAmount(totalSpent)} /{' '}
                          {formatCurrencyAmount(cap)}
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-foreground/70"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>
    </main>
  )
}
