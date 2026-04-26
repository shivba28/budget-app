import { randomUUID } from 'expo-crypto'

import * as recurringQ from '@/src/db/queries/recurringRules'
import * as txq from '@/src/db/queries/transactions'

export type ManualRecurrenceCadence = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'yearly'

function parseIsoDate(ymd: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null
  const d = new Date(`${ymd}T12:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

function formatIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function daysInMonth(year: number, monthIndex0: number): number {
  return new Date(year, monthIndex0 + 1, 0).getDate()
}

function addMonthsClamped(d: Date, months: number): Date {
  const y = d.getFullYear()
  const m = d.getMonth()
  const day = d.getDate()
  const targetMonth = m + months
  const base = new Date(d)
  base.setDate(1)
  base.setMonth(targetMonth)
  const maxDay = daysInMonth(base.getFullYear(), base.getMonth())
  base.setDate(Math.min(day, maxDay))
  return base
}

function addYearsClamped(d: Date, years: number): Date {
  const y = d.getFullYear() + years
  const m = d.getMonth()
  const day = d.getDate()
  const maxDay = daysInMonth(y, m)
  return new Date(y, m, Math.min(day, maxDay), 12, 0, 0)
}

export function nextOccurrenceDate(ymd: string, cadence: ManualRecurrenceCadence): string | null {
  const d = parseIsoDate(ymd)
  if (!d) return null

  let next: Date
  if (cadence === 'daily') next = new Date(d.getTime() + 1 * 24 * 60 * 60 * 1000)
  else if (cadence === 'weekly') next = new Date(d.getTime() + 7 * 24 * 60 * 60 * 1000)
  else if (cadence === 'biweekly') next = new Date(d.getTime() + 14 * 24 * 60 * 60 * 1000)
  else if (cadence === 'monthly') next = addMonthsClamped(d, 1)
  else next = addYearsClamped(d, 1)

  return formatIsoDate(next)
}

export function createManualRecurringTransactions(input: {
  accountId: string
  date: string // first occurrence YYYY-MM-DD
  amount: number
  description: string
  category: string | null
  tripId: number | null
  cadence: ManualRecurrenceCadence
  untilDate: string | null // YYYY-MM-DD (inclusive). null = rolling auto-add fallback
}): void {
  const ruleId = randomUUID()
  const createdAt = new Date().toISOString()

  recurringQ.insertRecurringRule({
    id: ruleId,
    account_id: input.accountId,
    cadence: input.cadence,
    start_date: input.date,
    until_date: input.untilDate,
    last_generated_date: input.date,
    active: 1,
    created_at: createdAt,
    amount: input.amount,
    description: input.description,
    category: input.category,
    trip_id: input.tripId,
  })

  // Insert the first occurrence now; future ones are handled by recurringAutoAdd.
  txq.insertTransaction({
    id: `rec-${ruleId}-0-${randomUUID().slice(0, 8)}`,
    account_id: input.accountId,
    recurring_rule_id: ruleId,
    date: input.date,
    effective_date: null,
    trip_id: input.tripId,
    my_share: null,
    amount: input.amount,
    description: input.description,
    category: input.category,
    detail_category: null,
    pending: 0,
    user_confirmed: 1,
    source: 'manual',
    account_label: null,
    synced_at: null,
  })
}

/**
 * Link an existing manual transaction to a new recurring rule and generate *future* occurrences.
 * This avoids duplicating the current transaction.
 */
export function linkExistingTransactionToNewRecurrence(input: {
  transactionId: string
  accountId: string
  date: string
  amount: number
  description: string
  category: string | null
  tripId: number | null
  cadence: ManualRecurrenceCadence
  untilDate: string | null
}): string {

  const ruleId = randomUUID()
  const createdAt = new Date().toISOString()

  recurringQ.insertRecurringRule({
    id: ruleId,
    account_id: input.accountId,
    cadence: input.cadence,
    start_date: input.date,
    until_date: input.untilDate,
    last_generated_date: input.date,
    active: 1,
    created_at: createdAt,
    amount: input.amount,
    description: input.description,
    category: input.category,
    trip_id: input.tripId,
  })

  txq.updateTransaction(input.transactionId, { recurring_rule_id: ruleId })
  return ruleId
}

