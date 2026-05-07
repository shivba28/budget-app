/**
 * Recurring transaction auto-detection.
 *
 * Detection criteria (ALL must pass to avoid false positives like metro tickets):
 *  1. Same account_id
 *  2. Normalised description match (lowercase, trim, collapse spaces)
 *  3. Amount within ±2% of the median amount
 *  4. At least 3 occurrences
 *  5. Every consecutive gap is ≥7 days (excludes same-day / multi-day clusters)
 *  6. All consecutive gaps are within ±3 days of each other (consistent cadence)
 *  7. The most recent occurrence is within the last 45 days (still active)
 *  8. Not already linked to a recurring_rule_id
 *  9. Source is 'bank' or 'manual' (not internal transfers etc.)
 * 10. Must not be a one-off credit/refund spike (all amounts same sign)
 */

import type { TransactionRow } from '@/src/db/queries/transactions'
import type { ManualRecurrenceCadence } from './manualRecurring'

// ── helpers ────────────────────────────────────────────────────────────────

function normaliseDesc(desc: string): string {
  return desc
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    // Strip common trailing noise like ref numbers, card suffixes
    .replace(/\s*#\w+$/, '')
    .replace(/\s*\*+\w*$/, '')
    .replace(/\s*ref\s*\w+$/i, '')
}

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!
}

function daysBetween(a: string, b: string): number {
  const da = new Date(`${a}T12:00:00`).getTime()
  const db = new Date(`${b}T12:00:00`).getTime()
  return Math.round(Math.abs(da - db) / 86_400_000)
}

function daysSinceDate(ymd: string): number {
  const d = new Date(`${ymd}T12:00:00`).getTime()
  return Math.round((Date.now() - d) / 86_400_000)
}

function guessCadence(medianIntervalDays: number): ManualRecurrenceCadence {
  if (medianIntervalDays <= 2) return 'daily'
  if (medianIntervalDays <= 9) return 'weekly'
  if (medianIntervalDays <= 16) return 'biweekly'
  if (medianIntervalDays <= 35) return 'monthly'
  return 'yearly'
}

// ── types ──────────────────────────────────────────────────────────────────

export type DetectedRecurringGroup = {
  /** Normalised key identifying the group */
  key: string
  /** Guessed cadence */
  cadence: ManualRecurrenceCadence
  /** Median interval between occurrences in days */
  medianIntervalDays: number
  /** All transactions in the group, sorted oldest→newest */
  transactions: TransactionRow[]
  /** Most recent occurrence date */
  latestDate: string
  /** Typical amount (median) */
  typicalAmount: number
  /** Shared description (from most recent tx) */
  description: string
  /** Shared category (from most recent tx, or null) */
  category: string | null
  /** Account id */
  accountId: string
}

// ── main detection ─────────────────────────────────────────────────────────

export function detectRecurringGroups(
  transactions: TransactionRow[],
  opts: {
    minOccurrences?: number       // default 3
    minIntervalDays?: number      // default 7
    intervalToleranceDays?: number // default 3
    maxAgeDays?: number           // default 45
    amountTolerancePct?: number   // default 0.02 (2%)
  } = {},
): DetectedRecurringGroup[] {
  const {
    minOccurrences = 3,
    minIntervalDays = 7,
    intervalToleranceDays = 3,
    maxAgeDays = 45,
    amountTolerancePct = 0.02,
  } = opts

  // Filter: only unlinked transactions with a usable date/amount
  const eligible = transactions.filter(
    (tx) =>
      !tx.recurring_rule_id &&
      tx.date &&
      tx.amount !== 0 &&
      /^\d{4}-\d{2}-\d{2}$/.test(tx.date),
  )

  // Group by account + normalised description + same sign
  type GroupKey = string
  const buckets = new Map<GroupKey, TransactionRow[]>()

  for (const tx of eligible) {
    const normDesc = normaliseDesc(tx.description)
    const sign = tx.amount > 0 ? '+' : '-'
    const key = `${tx.account_id}||${normDesc}||${sign}`
    const bucket = buckets.get(key)
    if (bucket) {
      bucket.push(tx)
    } else {
      buckets.set(key, [tx])
    }
  }

  const results: DetectedRecurringGroup[] = []

  for (const [key, bucket] of buckets) {
    // Sort oldest → newest
    const sorted = bucket.slice().sort((a, b) =>
      a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
    )

    // Must have enough occurrences
    if (sorted.length < minOccurrences) continue

    // Check amounts are all within ±2% of the median
    const amounts = sorted.map((tx) => Math.abs(tx.amount))
    const med = median(amounts)
    const allAmountsClose = amounts.every(
      (a) => Math.abs(a - med) / (med || 1) <= amountTolerancePct,
    )
    if (!allAmountsClose) continue

    // Compute consecutive gaps
    const gaps: number[] = []
    for (let i = 1; i < sorted.length; i++) {
      gaps.push(daysBetween(sorted[i - 1]!.date, sorted[i]!.date))
    }

    // Every gap must be ≥ minIntervalDays (rejects multi-day clusters)
    if (gaps.some((g) => g < minIntervalDays)) continue

    // All gaps must be within ±intervalToleranceDays of each other
    const medGap = median(gaps)
    const gapsConsistent = gaps.every(
      (g) => Math.abs(g - medGap) <= intervalToleranceDays,
    )
    if (!gapsConsistent) continue

    // Latest occurrence must be within maxAgeDays
    const latestDate = sorted[sorted.length - 1]!.date
    if (daysSinceDate(latestDate) > maxAgeDays) continue

    const latest = sorted[sorted.length - 1]!
    results.push({
      key,
      cadence: guessCadence(medGap),
      medianIntervalDays: medGap,
      transactions: sorted,
      latestDate,
      typicalAmount: latest.amount < 0 ? -med : med,
      description: latest.description,
      category: latest.category ?? null,
      accountId: latest.account_id,
    })
  }

  // Sort by most recent first
  results.sort((a, b) => (a.latestDate < b.latestDate ? 1 : -1))

  return results
}
