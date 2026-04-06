import type { ReactElement } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  filterTransactionsByVisibleAccounts,
  filterTransactionsForCalendarMonth,
  formatCalendarMonthLabel,
  shiftCalendarMonth,
} from '../lib/api'
import * as storage from '../lib/storage'
import {
  buildTripSummaries,
  monthTimelineCommittedSpend,
  upcomingCommittedSpendByMonth,
} from '@/lib/insightsCommitments'
import { InsightsCommitmentBlocks } from '@/components/InsightsCommitmentBlocks'
import { InsightsDashboard } from '@/components/InsightsDashboard'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useRegisterNavScrollRoot } from '@/contexts/NavScrollContext'
import { analyzeTransactions } from '@/utils/analyzeTransactions'
import './Page.css'
import './Summary.css'

function nowYearMonth(): { year: number; month: number } {
  const d = new Date()
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}

export function Insights(): ReactElement {
  const [cursor, setCursor] = useState(nowYearMonth)
  const [exclusionRev, setExclusionRev] = useState(0)
  const [bankSyncRev, setBankSyncRev] = useState(0)
  const [budgetRev, setBudgetRev] = useState(0)
  const [tripsRev, setTripsRev] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  useRegisterNavScrollRoot(scrollRef)

  useEffect(() => {
    const on = (): void => {
      setExclusionRev((n) => n + 1)
    }
    window.addEventListener(storage.ACCOUNTS_EXCLUSIONS_CHANGED_EVENT, on)
    return () =>
      window.removeEventListener(storage.ACCOUNTS_EXCLUSIONS_CHANGED_EVENT, on)
  }, [])

  useEffect(() => {
    const on = (): void => {
      setBankSyncRev((n) => n + 1)
    }
    window.addEventListener(storage.BANK_SYNC_COMPLETED_EVENT, on)
    return () =>
      window.removeEventListener(storage.BANK_SYNC_COMPLETED_EVENT, on)
  }, [])

  useEffect(() => {
    const on = (): void => {
      setBudgetRev((n) => n + 1)
    }
    window.addEventListener(storage.MONTHLY_BUDGETS_CHANGED_EVENT, on)
    return () =>
      window.removeEventListener(storage.MONTHLY_BUDGETS_CHANGED_EVENT, on)
  }, [])

  useEffect(() => {
    const on = (): void => setTripsRev((n) => n + 1)
    window.addEventListener(storage.TRIPS_CHANGED_EVENT, on)
    return () =>
      window.removeEventListener(storage.TRIPS_CHANGED_EVENT, on)
  }, [])

  const allTransactions = useMemo(() => {
    void exclusionRev
    void bankSyncRev
    return filterTransactionsByVisibleAccounts(storage.getTransactions() ?? [])
  }, [exclusionRev, bankSyncRev])

  const hasGlobalData = allTransactions.length > 0

  const monthLabel = formatCalendarMonthLabel(cursor.year, cursor.month)
  const monthTxs = useMemo(
    () =>
      filterTransactionsForCalendarMonth(
        allTransactions,
        cursor.year,
        cursor.month,
      ),
    [allTransactions, cursor.year, cursor.month],
  )
  const hasAnyTransactionsInMonth = monthTxs.length > 0

  const insights = useMemo(() => {
    const mb = storage.getMonthlyBudgetsStored()
    return analyzeTransactions({
      transactions: allTransactions,
      categoryOverrides: storage.getCategoryOverrides(),
      focusYear: cursor.year,
      focusMonth: cursor.month,
      monthlyCategoryBudgetOverrides: mb.categories,
      monthlyTotalBudgetCap:
        mb.totalMonthly === null ? undefined : mb.totalMonthly,
    })
  }, [allTransactions, cursor.year, cursor.month, budgetRev])

  const commitment = useMemo(() => {
    void tripsRev
    const trips = storage.getTrips()
    const ref = new Date()
    return {
      upcoming: upcomingCommittedSpendByMonth(allTransactions, trips, ref),
      timeline: monthTimelineCommittedSpend(allTransactions, trips, ref),
      tripSummaries: buildTripSummaries(allTransactions, trips),
    }
  }, [allTransactions, bankSyncRev, tripsRev])

  function goPrev(): void {
    setCursor((c) => shiftCalendarMonth(c.year, c.month, -1))
  }

  function goNext(): void {
    setCursor((c) => shiftCalendarMonth(c.year, c.month, 1))
  }

  if (!hasGlobalData) {
    return (
      <main className="page page--fill page--summary summary-root">
        <div className="summary-top">
          <div className="summary-head">
            <h1 className="page__title">Insights</h1>
          </div>
        </div>
        <div ref={scrollRef} className="summary-scroll">
          <Card className="border-dashed shadow-none" role="status">
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              Nothing to analyze yet. Sync transactions from the{' '}
              <strong className="text-foreground">Transactions</strong> tab after you link a
              bank in <strong className="text-foreground">Settings</strong>.
            </CardContent>
          </Card>
        </div>
      </main>
    )
  }

  return (
    <main className="page page--fill page--summary summary-root">
      <div className="summary-top">
        <div className="summary-head summary-head--insights">
          <div className="summary-head__title-row">
            <h1 className="page__title">Insights</h1>
          </div>
          <div className="summary-head__month-row">
            <div className="summary-month-nav" aria-label="Select month">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-9 shrink-0 rounded-lg text-lg"
                onClick={goPrev}
                aria-label="Previous month"
              >
                ‹
              </Button>
              <span className="summary-month-nav__label">{monthLabel}</span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-9 shrink-0 rounded-lg text-lg"
                onClick={goNext}
                aria-label="Next month"
              >
                ›
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div ref={scrollRef} className="summary-scroll">
        {!hasAnyTransactionsInMonth ? (
          <p className="summary-empty">
            No transactions for <strong>{monthLabel}</strong>. Sync from the Transactions tab or
            pick another month.
          </p>
        ) : (
          <InsightsDashboard
            insights={insights}
            monthLabel={monthLabel}
            transactionCountMonth={monthTxs.length}
          />
        )}
        <InsightsCommitmentBlocks
          upcomingCommitted={commitment.upcoming}
          monthTimeline={commitment.timeline}
          tripSummaries={commitment.tripSummaries}
        />
      </div>
    </main>
  )
}
