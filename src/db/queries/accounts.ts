import { eq, ne } from 'drizzle-orm'
import type { InferSelectModel } from 'drizzle-orm'

import { MANUAL_ENROLLMENT_ID } from '../constants'
import { db } from '../index'
import { accounts } from '../schema'

export type AccountRow = InferSelectModel<typeof accounts>

export function listAllAccounts(): AccountRow[] {
  return db.select().from(accounts).all()
}

export function listManualAccounts(): AccountRow[] {
  return db
    .select()
    .from(accounts)
    .where(eq(accounts.enrollment_id, MANUAL_ENROLLMENT_ID))
    .all()
}

/** Linked bank accounts (Teller), not manual cash accounts. */
export function listBankLinkedAccounts(): AccountRow[] {
  return db
    .select()
    .from(accounts)
    .where(ne(accounts.enrollment_id, MANUAL_ENROLLMENT_ID))
    .all()
}

export function getAccount(id: string): AccountRow | undefined {
  return db.select().from(accounts).where(eq(accounts.id, id)).get()
}

export function insertAccount(row: typeof accounts.$inferInsert): void {
  db.insert(accounts).values(row).run()
}

export function updateAccount(
  id: string,
  patch: Partial<Omit<AccountRow, 'id'>>,
): void {
  db.update(accounts).set(patch).where(eq(accounts.id, id)).run()
}

export function deleteAccount(id: string): void {
  db.delete(accounts).where(eq(accounts.id, id)).run()
}

export function upsertBankAccountRow(
  row: typeof accounts.$inferInsert,
): void {
  db.insert(accounts)
    .values(row)
    .onConflictDoUpdate({
      target: accounts.id,
      set: {
        name: row.name,
        institution: row.institution,
        type: row.type,
        enrollment_id: row.enrollment_id,
        include_in_insights: row.include_in_insights,
      },
    })
    .run()
}
