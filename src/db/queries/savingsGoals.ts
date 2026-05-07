import { desc, eq } from 'drizzle-orm'
import type { InferSelectModel } from 'drizzle-orm'

import { db } from '../client'
import { savings_goals } from '../schema'

export type SavingsGoalRow = InferSelectModel<typeof savings_goals>

export function listSavingsGoals(): SavingsGoalRow[] {
  return db.select().from(savings_goals).orderBy(desc(savings_goals.created_at)).all()
}

export function getSavingsGoal(id: number): SavingsGoalRow | undefined {
  return db.select().from(savings_goals).where(eq(savings_goals.id, id)).get()
}

export function insertSavingsGoal(row: typeof savings_goals.$inferInsert): number {
  const r = db.insert(savings_goals).values(row).run()
  return Number(r.lastInsertRowId)
}

export function updateSavingsGoal(
  id: number,
  patch: Partial<Omit<SavingsGoalRow, 'id'>>,
): void {
  db.update(savings_goals).set(patch).where(eq(savings_goals.id, id)).run()
}

export function deleteSavingsGoal(id: number): void {
  db.delete(savings_goals).where(eq(savings_goals.id, id)).run()
}
