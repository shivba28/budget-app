import { eq } from 'drizzle-orm'
import type { InferSelectModel } from 'drizzle-orm'

import { db } from '../client'
import { teller_enrollments } from '../schema'

export type TellerEnrollmentRow = InferSelectModel<typeof teller_enrollments>

export function listTellerEnrollments(): TellerEnrollmentRow[] {
  return db.select().from(teller_enrollments).all()
}

export function upsertTellerEnrollment(
  row: typeof teller_enrollments.$inferInsert,
): void {
  db.insert(teller_enrollments)
    .values(row)
    .onConflictDoUpdate({
      target: teller_enrollments.enrollment_id,
      set: {
        institution_name: row.institution_name,
        user_id: row.user_id,
        status: row.status,
        last_sync_at: row.last_sync_at,
        last_error: row.last_error,
      },
    })
    .run()
}

export function deleteTellerEnrollment(enrollmentId: string): void {
  db.delete(teller_enrollments)
    .where(eq(teller_enrollments.enrollment_id, enrollmentId))
    .run()
}
