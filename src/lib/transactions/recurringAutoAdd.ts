import * as recurringQ from '@/src/db/queries/recurringRules'
import * as txq from '@/src/db/queries/transactions'
import { nextOccurrenceDate, type ManualRecurrenceCadence } from '@/src/lib/transactions/manualRecurring'

function parseYm(ym: string): { y: number; m: number } | null {
  const m = ym.match(/^(\d{4})-(\d{2})$/)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  if (!y || mo < 1 || mo > 12) return null
  return { y, m: mo }
}

function endOfMonthIso(ym: string): string | null {
  const p = parseYm(ym)
  if (!p) return null
  const last = new Date(p.y, p.m, 0) // day 0 => last day of previous month; month is 1-based here
  const yyyy = String(p.y)
  const mm = String(p.m).padStart(2, '0')
  const dd = String(last.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function addDaysIso(baseIso: string, days: number): string {
  const d = new Date(`${baseIso}T12:00:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * Ensure recurring rules have generated transactions up to:
 * - `until_date` (if set, inclusive), otherwise
 * - the end of `until_ym` (if set, inclusive), otherwise
 * - a rolling horizon (fallback).
 */
export function ensureRecurringTransactionsSeeded(opts?: { rollingDays?: number }): void {
  const rollingDays = Math.max(7, Math.min(120, opts?.rollingDays ?? 35))
  const today = new Date().toISOString().slice(0, 10)
  const rollingEnd = addDaysIso(today, rollingDays)

  const rules = recurringQ.listActiveRecurringRules()
  for (const rule of rules) {
    const cadence = rule.cadence as ManualRecurrenceCadence
    const end =
      rule.until_date != null
        ? rule.until_date
        : (rule.until_ym != null ? (endOfMonthIso(rule.until_ym) ?? rollingEnd) : rollingEnd)

    // Respect a concrete "until".
    if ((rule.until_date != null || rule.until_ym != null) && end < rule.start_date) continue

    const maxExisting = txq.maxDateForRecurringRule(rule.id)
    const last = (rule.last_generated_date ?? maxExisting ?? rule.start_date)

    // Start from next after last generated/existing.
    let next = nextOccurrenceDate(last, cadence)
    if (!next) continue

    let progressed: string | null = null
    // Insert any missing occurrences up to the target end.
    while (next <= end) {
      progressed = next
      if (!txq.hasRecurringTxOnDate(rule.id, next)) {
        txq.insertTransaction({
          id: `rec-${rule.id}-auto-${next}-${Math.random().toString(36).slice(2, 8)}`,
          account_id: rule.account_id,
          recurring_rule_id: rule.id,
          date: next,
          effective_date: null,
          trip_id: rule.trip_id ?? null,
          my_share: null,
          amount: rule.amount,
          description: rule.description,
          category: rule.category ?? null,
          detail_category: null,
          pending: 0,
          user_confirmed: 1,
          source: 'manual',
          account_label: null,
          synced_at: null,
        })
      }
      const n2 = nextOccurrenceDate(next, cadence)
      if (!n2) break
      next = n2
    }

    if (progressed) {
      recurringQ.updateRecurringRule(rule.id, { last_generated_date: progressed })
    }
  }
}

