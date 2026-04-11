import type { ReactElement } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Plane } from 'lucide-react'
import {
  filterTransactionsByVisibleAccounts,
  formatCurrencyAmount,
  getCategoryLabel,
  getCategoryPillColor,
  resolveCanonicalDisplayCategory,
  resolveMyShare,
} from '@/lib/api'
import * as storage from '@/lib/storage'
import { AddTripSheet } from '@/components/AddTripSheet'
import {
  NAV_PLUS_DISABLED_EVENT,
  OPEN_ADD_TRIP_EVENT,
} from '@/constants/navFabEvents'
import { categoryBreakdownForTrip } from '@/lib/insightsCommitments'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  const [addTripSheetOpen, setAddTripSheetOpen] = useState(false)
  const [editTripSheetOpen, setEditTripSheetOpen] = useState(false)

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
    const open = (): void => {
      setEditTripSheetOpen(false)
      setAddTripSheetOpen(true)
    }
    window.addEventListener(OPEN_ADD_TRIP_EVENT, open)
    return () => window.removeEventListener(OPEN_ADD_TRIP_EVENT, open)
  }, [])

  useEffect(() => {
    const disabled = addTripSheetOpen || editTripSheetOpen
    try {
      window.dispatchEvent(
        new CustomEvent(NAV_PLUS_DISABLED_EVENT, { detail: { disabled } }),
      )
    } catch {
      /* ignore */
    }
  }, [addTripSheetOpen, editTripSheetOpen])

  useEffect(() => {
    return () => {
      try {
        window.dispatchEvent(
          new CustomEvent(NAV_PLUS_DISABLED_EVENT, {
            detail: { disabled: false },
          }),
        )
      } catch {
        /* ignore */
      }
    }
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
      const share = resolveMyShare(t)
      if (share > 0) s += share
    }
    return s
  }, [tripTxs])

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
        <div className="space-y-2">
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            onClick={() => {
              setAddTripSheetOpen(false)
              setEditTripSheetOpen(true)
            }}
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
                  .map((t) => {
                    const share = resolveMyShare(t)
                    const showTotal =
                      t.myShare != null &&
                      Math.abs(t.amount - share) > 1e-6
                    return (
                    <li
                      key={`${t.accountId}:${t.id}`}
                      className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{t.description}</div>
                        <div className="text-muted-foreground text-xs">
                          {t.date} ·{' '}
                          {getCategoryLabel(
                            resolveCanonicalDisplayCategory(t, overrides),
                          )}
                          {showTotal ? (
                            <span>
                              {' '}
                              · Total {formatCurrencyAmount(t.amount)}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <span
                        className={
                          share > 0
                            ? 'shrink-0 tabular-nums text-foreground'
                            : 'shrink-0 tabular-nums text-muted-foreground'
                        }
                      >
                        {formatCurrencyAmount(share)}
                      </span>
                    </li>
                  )})}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <AddTripSheet
        open={addTripSheetOpen || editTripSheetOpen}
        tripToEdit={editTripSheetOpen ? activeTrip : null}
        onClose={() => {
          setAddTripSheetOpen(false)
          setEditTripSheetOpen(false)
        }}
        onAdded={(trip) => {
          setRev((n) => n + 1)
          setAddTripSheetOpen(false)
          navigate(`/app/trips/${trip.id}`)
        }}
        onUpdated={() => {
          setRev((n) => n + 1)
          setEditTripSheetOpen(false)
        }}
      />
    </main>
  )
}
