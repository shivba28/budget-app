import type { ReactElement } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Plane } from 'lucide-react'
import { AddTripSheet } from '@/components/AddTripSheet'
import { TripsLoadingSkeleton } from '@/components/TripsLoadingSkeleton'
import { filterTransactionsByVisibleAccounts, formatCurrencyAmount } from '@/lib/api'
import * as storage from '@/lib/storage'
import { buildTripSummaries } from '@/lib/insightsCommitments'
import { Card, CardContent } from '@/components/ui/card'
import {
  NAV_PLUS_DISABLED_EVENT,
  OPEN_ADD_TRIP_EVENT,
} from '@/constants/navFabEvents'
import { useRegisterNavScrollRoot } from '@/contexts/NavScrollContext'
import './Page.css'
import './Summary.css'

export function Trips(): ReactElement {
  const scrollRef = useRef<HTMLDivElement>(null)
  useRegisterNavScrollRoot(scrollRef)
  const location = useLocation()
  const navigate = useNavigate()
  const [rev, setRev] = useState(0)
  const [bankRev, setBankRev] = useState(0)
  const [addTripSheetOpen, setAddTripSheetOpen] = useState(false)
  const [tripsHydrated, setTripsHydrated] = useState(false)

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
      try {
        const { fetchTripsFromServer } = await import('@/lib/serverData')
        const t = await fetchTripsFromServer()
        if (t) {
          storage.saveTrips(t)
          setRev((n) => n + 1)
        }
      } finally {
        setTripsHydrated(true)
      }
    })()
  }, [])

  useEffect(() => {
    const s = location.state as { openNewTrip?: boolean } | null | undefined
    if (s?.openNewTrip) {
      setAddTripSheetOpen(true)
      navigate('.', { replace: true, state: null })
    }
  }, [location.state, navigate])

  useEffect(() => {
    const open = (): void => setAddTripSheetOpen(true)
    window.addEventListener(OPEN_ADD_TRIP_EVENT, open)
    return () => window.removeEventListener(OPEN_ADD_TRIP_EVENT, open)
  }, [])

  useEffect(() => {
    const disabled = addTripSheetOpen
    try {
      window.dispatchEvent(
        new CustomEvent(NAV_PLUS_DISABLED_EVENT, { detail: { disabled } }),
      )
    } catch {
      /* ignore */
    }
  }, [addTripSheetOpen])

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

  const trips = useMemo(() => storage.getTrips(), [rev])
  const txs = useMemo(() => {
    void bankRev
    return filterTransactionsByVisibleAccounts(storage.getTransactions() ?? [])
  }, [bankRev, rev])

  const rows = useMemo(
    () => buildTripSummaries(txs, trips),
    [txs, trips],
  )

  return (
    <>
      {!tripsHydrated ? (
        <TripsLoadingSkeleton scrollRef={scrollRef} />
      ) : (
    <main className="page page--fill page--summary summary-root">
      <div className="summary-top">
        <div className="summary-head">
          <h1 className="page__title">Trips</h1>
        </div>
      </div>

      <div ref={scrollRef} className="summary-scroll space-y-3">
        {rows.length === 0 && !addTripSheetOpen ? (
          <Card className="border-dashed shadow-none" role="status">
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              No trips yet. Tap <strong className="text-foreground">+</strong> below to add a trip,
              or assign transactions from the Transactions tab.
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
      )}
      <AddTripSheet
        open={addTripSheetOpen}
        onClose={() => setAddTripSheetOpen(false)}
        onAdded={() => {
          setRev((n) => n + 1)
        }}
      />
    </>
  )
}
