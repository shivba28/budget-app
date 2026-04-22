import { eq } from 'drizzle-orm'
import type { InferSelectModel } from 'drizzle-orm'

import { db } from '../index'
import { categories } from '../schema'

export type CategoryRow = InferSelectModel<typeof categories>

export function listCategories(): CategoryRow[] {
  return db.select().from(categories).all()
}

export function getCategory(id: string): CategoryRow | undefined {
  return db.select().from(categories).where(eq(categories.id, id)).get()
}

export function insertCategory(row: typeof categories.$inferInsert): void {
  db.insert(categories).values(row).run()
}

export function updateCategory(
  id: string,
  patch: Partial<Omit<CategoryRow, 'id'>>,
): void {
  db.update(categories).set(patch).where(eq(categories.id, id)).run()
}

export function deleteCategory(id: string): void {
  db.delete(categories).where(eq(categories.id, id)).run()
}

function hashLabelId(label: string): string {
  let h = 5381
  for (let i = 0; i < label.length; i++) {
    h = Math.imul(h, 33) + label.charCodeAt(i)
  }
  return (h >>> 0).toString(16)
}

/** Idempotent: ensure a category row exists for a Teller label. */
export function ensureTellerCategoryLabel(label: string): void {
  const t = label.trim() || 'Other'
  const id = `cat_tl_${hashLabelId(t)}`
  const existing = getCategory(id)
  if (existing) return
  insertCategory({ id, label: t, color: null, source: 'teller' })
}

