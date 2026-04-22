import { eq } from 'drizzle-orm'
import type { InferSelectModel } from 'drizzle-orm'

import { db } from '../index'
import { budgets } from '../schema'

export type BudgetRow = InferSelectModel<typeof budgets>

export function listBudgets(month?: string): BudgetRow[] {
  if (month) {
    return db.select().from(budgets).where(eq(budgets.month, month)).all()
  }
  return db.select().from(budgets).all()
}

export function getBudget(id: number): BudgetRow | undefined {
  return db.select().from(budgets).where(eq(budgets.id, id)).get()
}

export function insertBudget(row: typeof budgets.$inferInsert): number {
  const r = db.insert(budgets).values(row).run()
  return Number(r.lastInsertRowId)
}

export function updateBudget(
  id: number,
  patch: Partial<Omit<BudgetRow, 'id'>>,
): void {
  db.update(budgets).set(patch).where(eq(budgets.id, id)).run()
}

export function deleteBudget(id: number): void {
  db.delete(budgets).where(eq(budgets.id, id)).run()
}
