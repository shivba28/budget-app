import { count, desc, eq, sql } from 'drizzle-orm'
import type { InferSelectModel } from 'drizzle-orm'

import { db } from '../client'
import { transactions } from '../schema'

export type TransactionRow = InferSelectModel<typeof transactions>

export function listTransactions(): TransactionRow[] {
  return db
    .select()
    .from(transactions)
    .orderBy(desc(transactions.date), desc(transactions.id))
    .all()
}

export function getTransaction(id: string): TransactionRow | undefined {
  return db.select().from(transactions).where(eq(transactions.id, id)).get()
}

export function insertTransaction(row: typeof transactions.$inferInsert): void {
  db.insert(transactions).values(row).run()
}

export function updateTransaction(
  id: string,
  patch: Partial<Omit<TransactionRow, 'id'>>,
): void {
  db.update(transactions).set(patch).where(eq(transactions.id, id)).run()
}

export function deleteTransaction(id: string): void {
  db.delete(transactions).where(eq(transactions.id, id)).run()
}

export function deleteTransactionsForAccount(accountId: string): void {
  db.delete(transactions).where(eq(transactions.account_id, accountId)).run()
}

/** Detach transactions from a trip before deleting the trip. */
export function clearTripIdForTrip(tripId: number): void {
  db
    .update(transactions)
    .set({ trip_id: null })
    .where(eq(transactions.trip_id, tripId))
    .run()
}

/** Set category to null for transactions whose category matches label (trim, case-insensitive). */
export function clearTransactionsCategoryMatchingLabel(label: string): void {
  const t = label.trim()
  if (!t) return
  db.update(transactions)
    .set({ category: null })
    .where(sql`lower(trim(coalesce(${transactions.category}, ''))) = lower(${t})`)
    .run()
}

export function countForAccount(accountId: string): number {
  const row = db
    .select({ c: count() })
    .from(transactions)
    .where(eq(transactions.account_id, accountId))
    .get()
  return Number(row?.c ?? 0)
}

export function maxDateForRecurringRule(ruleId: string): string | null {
  const row = db
    .select({ d: sql<string | null>`max(${transactions.date})` })
    .from(transactions)
    .where(eq(transactions.recurring_rule_id, ruleId))
    .get()
  return row?.d ?? null
}

export function hasRecurringTxOnDate(ruleId: string, ymd: string): boolean {
  const row = db
    .select({ c: count() })
    .from(transactions)
    .where(sql`${transactions.recurring_rule_id} = ${ruleId} AND ${transactions.date} = ${ymd}`)
    .get()
  return Number(row?.c ?? 0) > 0
}
