import type { Transaction, Trip } from '@/lib/domain'
import {
  resolveTransactionBudgetMonthKey,
  tripsMapFromList,
} from '@/lib/effectiveMonth'
import { getCategoryLabel, resolveDisplayCategory } from '@/lib/api'

function monthKeyAfter(
  year: number,
  month1to12: number,
  delta: number,
): string {
  const d = new Date(year, month1to12 - 1 + delta, 1)
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  return `${y}-${String(m).padStart(2, '0')}`
}

export function formatMonthHeadingFromKey(monthKey: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(monthKey)
  if (!m) return monthKey
  const y = Number(m[1])
  const mo = Number(m[2])
  return new Intl.DateTimeFormat(undefined, {
    month: 'long',
    year: 'numeric',
  }).format(new Date(y, mo - 1, 1))
}

/** Next 3 calendar months after `ref` (not including ref’s month), with committed positive spend. */
export function upcomingCommittedSpendByMonth(
  txs: readonly Transaction[],
  trips: readonly Trip[],
  ref: Date,
): { readonly monthKey: string; readonly label: string; readonly total: number }[] {
  const map = tripsMapFromList(trips)
  const y = ref.getFullYear()
  const m = ref.getMonth() + 1
  const keys = [1, 2, 3].map((d) => monthKeyAfter(y, m, d))
  const totals = new Map<string, number>()
  for (const k of keys) totals.set(k, 0)

  for (const tx of txs) {
    const bmk = resolveTransactionBudgetMonthKey(tx, map)
    if (!totals.has(bmk)) continue
    if (tx.amount > 0) totals.set(bmk, (totals.get(bmk) ?? 0) + tx.amount)
  }

  return keys.map((monthKey) => ({
    monthKey,
    label: formatMonthHeadingFromKey(monthKey),
    total: totals.get(monthKey) ?? 0,
  }))
}

/** Current month + next 3 months, committed positive spend per budget month. */
export function monthTimelineCommittedSpend(
  txs: readonly Transaction[],
  trips: readonly Trip[],
  ref: Date,
): { readonly monthKey: string; readonly label: string; readonly total: number }[] {
  const map = tripsMapFromList(trips)
  const y = ref.getFullYear()
  const m = ref.getMonth() + 1
  const keys = [0, 1, 2, 3].map((d) => monthKeyAfter(y, m, d))
  const totals = new Map<string, number>()
  for (const k of keys) totals.set(k, 0)

  for (const tx of txs) {
    const bmk = resolveTransactionBudgetMonthKey(tx, map)
    if (!totals.has(bmk)) continue
    if (tx.amount > 0) totals.set(bmk, (totals.get(bmk) ?? 0) + tx.amount)
  }

  return keys.map((monthKey) => ({
    monthKey,
    label: formatMonthHeadingFromKey(monthKey),
    total: totals.get(monthKey) ?? 0,
  }))
}

export type TripSummaryRow = {
  readonly trip: Trip
  readonly totalSpent: number
  readonly txCount: number
}

export function buildTripSummaries(
  txs: readonly Transaction[],
  trips: readonly Trip[],
): TripSummaryRow[] {
  const byTrip = new Map<number, { total: number; count: number }>()
  for (const t of trips) {
    byTrip.set(t.id, { total: 0, count: 0 })
  }
  for (const tx of txs) {
    const tid = tx.tripId
    if (tid == null || !Number.isFinite(tid)) continue
    const cur = byTrip.get(tid)
    if (!cur) continue
    cur.count += 1
    if (tx.amount > 0) cur.total += tx.amount
  }

  const refMk = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
  return trips
    .filter((trip) => {
      const startMk = trip.startDate.slice(0, 7)
      return startMk >= refMk || (byTrip.get(trip.id)?.count ?? 0) > 0
    })
    .map((trip) => {
      const agg = byTrip.get(trip.id) ?? { total: 0, count: 0 }
      return { trip, totalSpent: agg.total, txCount: agg.count }
    })
    .sort((a, b) => a.trip.startDate.localeCompare(b.trip.startDate))
}

export function categoryBreakdownForTrip(
  txs: readonly Transaction[],
  tripId: number,
  categoryOverrides: Readonly<Record<string, string>>,
): { readonly categoryId: string; readonly label: string; readonly total: number }[] {
  const map = new Map<string, number>()
  for (const tx of txs) {
    if (tx.tripId !== tripId) continue
    if (tx.amount <= 0) continue
    const cid = resolveDisplayCategory(tx, categoryOverrides)
    map.set(cid, (map.get(cid) ?? 0) + tx.amount)
  }
  return [...map.entries()]
    .map(([categoryId, total]) => ({
      categoryId,
      label: getCategoryLabel(categoryId),
      total,
    }))
    .sort((a, b) => b.total - a.total)
}
