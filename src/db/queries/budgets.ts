import { and, eq } from 'drizzle-orm'
import type { InferSelectModel } from 'drizzle-orm'

import { db } from '../client'
import { budgets } from '../schema'

export type BudgetRow = InferSelectModel<typeof budgets>

export function listBudgets(month?: string): BudgetRow[] {
  const rows = month
    ? db.select().from(budgets).where(eq(budgets.month, month)).all()
    : db.select().from(budgets).all()
  // Prefer latest row per (month, category) if duplicates exist before migration cleanup.
  const dedup = new Map<string, BudgetRow>()
  for (const r of rows) {
    const key = `${r.month}\0${r.category}`
    const prev = dedup.get(key)
    if (!prev || r.id > prev.id) dedup.set(key, r)
  }
  return Array.from(dedup.values()).sort((a, b) => {
    if (a.month !== b.month) return a.month.localeCompare(b.month)
    return a.category.localeCompare(b.category)
  })
}

export function getBudget(id: number): BudgetRow | undefined {
  return db.select().from(budgets).where(eq(budgets.id, id)).get()
}

export function insertBudget(row: typeof budgets.$inferInsert): number {
  const r = db.insert(budgets).values(row).run()
  return Number(r.lastInsertRowId)
}

/** Insert or update the single budget row for this month + category (unique index). */
export function upsertBudgetForMonth(input: {
  category: string
  amount: number
  month: string
}): number {
  const existing = db
    .select()
    .from(budgets)
    .where(and(eq(budgets.month, input.month), eq(budgets.category, input.category)))
    .get()
  if (existing) {
    db.update(budgets).set({ amount: input.amount }).where(eq(budgets.id, existing.id)).run()
    return existing.id
  }
  return insertBudget({
    category: input.category,
    amount: input.amount,
    month: input.month,
  })
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
