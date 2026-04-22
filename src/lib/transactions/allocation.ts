import type { TransactionRow } from '@/src/db/queries/transactions'

/** Clear trip, share override, defer date, and category overrides. */
export function clearAllocationPatch(): Partial<TransactionRow> {
  return {
    trip_id: null,
    my_share: null,
    effective_date: null,
    category: null,
    detail_category: null,
  }
}

/** Mark a pending bank transaction as reviewed / posted. */
export function markPostedPatch(): Partial<TransactionRow> {
  return {
    pending: 0,
    user_confirmed: 1,
  }
}
