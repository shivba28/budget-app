import type { Transaction, Trip } from '@/lib/domain'

function monthKeyFromDateStr(iso: string): string {
  if (typeof iso !== 'string' || iso.length < 7) return ''
  return iso.slice(0, 7)
}

/** Build Map for O(1) trip lookup. */
export function tripsMapFromList(trips: readonly Trip[]): Map<number, Trip> {
  const m = new Map<number, Trip>()
  for (const t of trips) m.set(t.id, t)
  return m
}

/**
 * Calendar month (YYYY-MM) used for budgets and Insights for this transaction.
 * Priority: trip_id (if trip exists) > effective_date > posting date.
 * Trip: if trip start month is strictly after posting month → budget month = trip start month; else posting month.
 */
export function resolveTransactionBudgetMonthKey(
  tx: Transaction,
  tripsById: ReadonlyMap<number, Trip>,
): string {
  const txMk = monthKeyFromDateStr(tx.date)
  if (!txMk) return ''

  const tid = tx.tripId
  if (tid != null && Number.isFinite(tid)) {
    const trip = tripsById.get(tid)
    if (trip) {
      const startMk = monthKeyFromDateStr(trip.startDate)
      if (startMk && startMk > txMk) return startMk
      return txMk
    }
  }

  const eff = tx.effectiveDate
  if (typeof eff === 'string' && eff.length >= 7) {
    const eMk = monthKeyFromDateStr(eff)
    if (eMk) return eMk
  }

  return txMk
}

export function resolveTransactionBudgetYearMonth(
  tx: Transaction,
  tripsById: ReadonlyMap<number, Trip>,
): { year: number; month: number } | null {
  const key = resolveTransactionBudgetMonthKey(tx, tripsById)
  const m = /^(\d{4})-(\d{2})$/.exec(key)
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null
  return { year, month }
}

/**
 * True when this tx “posts” in `viewYear/viewMonth` but its budget month is a later calendar month
 * (deferred / future trip), so we grey it out in that month’s list and exclude from that month’s budget totals.
 */
export function isDeferredOutOfViewMonth(
  tx: Transaction,
  tripsById: ReadonlyMap<number, Trip>,
  viewYear: number,
  viewMonth1to12: number,
): boolean {
  const postMk = monthKeyFromDateStr(tx.date)
  const viewMk = `${viewYear}-${String(viewMonth1to12).padStart(2, '0')}`
  if (!postMk || postMk !== viewMk) return false
  const budgetMk = resolveTransactionBudgetMonthKey(tx, tripsById)
  return budgetMk > viewMk
}
