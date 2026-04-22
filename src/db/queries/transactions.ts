import { count, desc, eq } from 'drizzle-orm'
import type { InferSelectModel } from 'drizzle-orm'

import { db } from '../index'
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

export function countForAccount(accountId: string): number {
  const row = db
    .select({ c: count() })
    .from(transactions)
    .where(eq(transactions.account_id, accountId))
    .get()
  return Number(row?.c ?? 0)
}
