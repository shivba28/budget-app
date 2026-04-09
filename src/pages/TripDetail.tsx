import type { ReactElement } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Plane } from 'lucide-react'
import {
  filterTransactionsByVisibleAccounts,
  formatCurrencyAmount,
  getCategoryLabel,
  getCategoryPillColor,
  resolveDisplayCategory,
} from '@/lib/api'
import * as storage from '@/lib/storage'
import { categoryBreakdownForTrip } from '@/lib/insightsCommitments'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useRegisterNavScrollRoot } from '@/contexts/NavScrollContext'
import './Page.css'
import './Summary.css'

export function TripDetail(): ReactElement {
  const { tripId: tripIdParam } = useParams()
  const navigate = useNavigate()
  const scrollRef = useRef<HTMLDivElement>(null)
  useRegisterNavScrollRoot(scrollRef)
  const tripId = tripIdParam ? Number(tripIdParam) : NaN

  const [rev, setRev] = useState(0)
  const [bankRev, setBankRev] = useState(0)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [start, setStart] = useState('')
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

  const trip = useMemo(() => {
    void rev
    return storage.getTrips().find((t) => t.id === tripId) ?? null
  }, [rev, tripId])

  const txs = useMemo(() => {
    void bankRev
    return filterTransactionsByVisibleAccounts(storage.getTransactions() ?? [])
  }, [bankRev])

  const tripTxs = useMemo(
    () => txs.filter((t) => t.tripId === tripId),
    [txs, tripId],
  )

  const overrides = useMemo(() => storage.getCategoryOverrides(), [bankRev, rev])

  const breakdown = useMemo(
    () =>
      Number.isFinite(tripId)
        ? categoryBreakdownForTrip(txs, tripId, overrides)
        : [],
    [txs, tripId, overrides],
  )

  const totalSpend = useMemo(() => {
    let s = 0
    for (const t of tripTxs) {
      if (t.amount > 0) s += t.amount
    }
    return s
  }, [tripTxs])

  useEffect(() => {
    if (!trip) return
    setName(trip.name)
    setStart(trip.startDate)
    setEnd(trip.endDate ?? '')
    setBudget(trip.budgetLimit !== null ? String(trip.budgetLimit) : '')
  }, [trip])

  if (!Number.isFinite(tripId) || tripId < 1) {
    return (
      <main className="page page--fill page--summary summary-root">
        <div className="summary-scroll p-4">
          <p className="text-sm text-muted-foreground">Invalid trip.</p>
          <Link to="/app/trips" className="text-sm underline">
            Back to trips
          </Link>
        </div>
      </main>
    )
  }

  if (!trip) {
    return (
      <main className="page page--fill page--summary summary-root">
        <div className="summary-scroll p-4">
          <p className="text-sm text-muted-foreground">Trip not found.</p>
          <Link to="/app/trips" className="text-sm underline">
            Back to trips
          </Link>
        </div>
      </main>
    )
  }

  const activeTrip = trip

  async function saveEdit(): Promise<void> {
    const n = name.trim()
    if (!n || start.length < 10) return
    let budgetLimit: number | null = null
    const b = budget.trim().replace(/[$,]/g, '')
    if (b !== '') {
      const x = Number(b)
      if (!Number.isFinite(x) || x < 0) return
      budgetLimit = Math.round(x * 100) / 100
    }
    const { updateTripOnServer } = await import('@/lib/serverData')
    const ok = await updateTripOnServer(activeTrip.id, {
      name: n,
      startDate: start,
      endDate: end.trim().length >= 10 ? end.slice(0, 10) : null,
      budgetLimit,
    })
    if (!ok) return
    setRev((x) => x + 1)
    setEditing(false)
  }

  async function removeTrip(): Promise<void> {
    if (
      !window.confirm(
        `Delete “${activeTrip.name}”? Transactions stay; trip assignment is cleared.`,
      )
    ) {
      return
    }
    const { deleteTripOnServer } = await import('@/lib/serverData')
    const ok = await deleteTripOnServer(activeTrip.id)
    if (!ok) return
    navigate('/app/trips')
  }

  const cap = activeTrip.budgetLimit
  const pct =
    cap !== null && cap > 0
      ? Math.min(100, (totalSpend / cap) * 100)
      : null

  return (
    <main className="page page--fill page--summary summary-root">
      <div className="summary-top">
        <div className="summary-head">
          <div className="flex w-full flex-wrap items-center gap-2">
            <Link
              to="/app/trips"
              className="text-muted-foreground text-sm hover:text-foreground"
            >
              ← Trips
            </Link>
          </div>
          <div className="flex items-start gap-2">
            <Plane className="mt-1 size-5 shrink-0 text-muted-foreground" aria-hidden />
            <h1 className="page__title mb-0">{activeTrip.name}</h1>
          </div>
        </div>
      </div>

      <div ref={scrollRef} className="summary-scroll space-y-3">
        {!editing ? (
          <div className="space-y-2">
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={() => setEditing(true)}
            >
              Edit trip
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => void removeTrip()}
            >
              Delete trip
            </Button>
          </div>
        ) : (
          <Card className="shadow-xs">
            <CardContent className="space-y-3 pt-4">
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-muted-foreground">Name</span>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
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
              <div className="flex gap-2">
                <Button
                  type="button"
                  className="flex-1"
                  onClick={() => void saveEdit()}
                >
                  Save
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="flex-1"
                  onClick={() => setEditing(false)}
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="shadow-xs">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Totals</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Spent (outflows)</span>
              <span className="font-medium tabular-nums">
                {formatCurrencyAmount(totalSpend)}
              </span>
            </div>
            {cap !== null && cap > 0 ? (
              <>
                <div className="flex justify-between gap-2 text-xs text-muted-foreground">
                  <span>Budget</span>
                  <span className="tabular-nums">{formatCurrencyAmount(cap)}</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-foreground/70"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>

        <Card className="shadow-xs">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">By category</CardTitle>
          </CardHeader>
          <CardContent>
            {breakdown.length === 0 ? (
              <p className="text-muted-foreground text-sm">No spending on this trip yet.</p>
            ) : (
              <ul className="space-y-2">
                {breakdown.map((row) => (
                  <li
                    key={row.categoryId}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{
                          backgroundColor: getCategoryPillColor(row.categoryId),
                        }}
                        aria-hidden
                      />
                      <span className="truncate">{row.label}</span>
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {formatCurrencyAmount(row.total)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-xs">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Transactions</CardTitle>
            <p className="text-muted-foreground text-sm">
              {tripTxs.length} assigned
            </p>
          </CardHeader>
          <CardContent>
            {tripTxs.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No transactions assigned to this trip.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {[...tripTxs]
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((t) => (
                    <li
                      key={`${t.accountId}:${t.id}`}
                      className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{t.description}</div>
                        <div className="text-muted-foreground text-xs">
                          {t.date} ·{' '}
                          {getCategoryLabel(resolveDisplayCategory(t, overrides))}
                        </div>
                      </div>
                      <span
                        className={
                          t.amount > 0
                            ? 'shrink-0 tabular-nums text-foreground'
                            : 'shrink-0 tabular-nums text-muted-foreground'
                        }
                      >
                        {formatCurrencyAmount(t.amount)}
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
