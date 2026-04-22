import { desc, eq } from 'drizzle-orm'
import type { InferSelectModel } from 'drizzle-orm'

import { db } from '../index'
import { trips } from '../schema'

export type TripRow = InferSelectModel<typeof trips>

export function listTrips(): TripRow[] {
  return db.select().from(trips).orderBy(desc(trips.created_at)).all()
}

export function getTrip(id: number): TripRow | undefined {
  return db.select().from(trips).where(eq(trips.id, id)).get()
}

export function insertTrip(row: typeof trips.$inferInsert): number {
  const r = db.insert(trips).values(row).run()
  return Number(r.lastInsertRowId)
}

export function updateTrip(
  id: number,
  patch: Partial<Omit<TripRow, 'id'>>,
): void {
  db.update(trips).set(patch).where(eq(trips.id, id)).run()
}

export function deleteTrip(id: number): void {
  db.delete(trips).where(eq(trips.id, id)).run()
}
