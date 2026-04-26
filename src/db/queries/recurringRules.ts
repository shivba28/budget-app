import { eq } from 'drizzle-orm'
import type { InferSelectModel } from 'drizzle-orm'

import { db } from '../client'
import { recurring_rules } from '../schema'

export type RecurringRuleRow = InferSelectModel<typeof recurring_rules>

export function insertRecurringRule(row: typeof recurring_rules.$inferInsert): void {
  db.insert(recurring_rules).values(row).run()
}

export function getRecurringRule(id: string): RecurringRuleRow | undefined {
  return db.select().from(recurring_rules).where(eq(recurring_rules.id, id)).get()
}

export function listActiveRecurringRules(): RecurringRuleRow[] {
  return db.select().from(recurring_rules).where(eq(recurring_rules.active, 1)).all()
}

export function updateRecurringRule(
  id: string,
  patch: Partial<Omit<RecurringRuleRow, 'id'>>,
): void {
  db.update(recurring_rules).set(patch).where(eq(recurring_rules.id, id)).run()
}

