/**
 * Set allocation for a transaction (PATCH /api/user/transactions/:id/allocate).
 */
import * as storage from '@/lib/storage'

export async function allocateTransaction(
  transactionId: string,
  input:
    | { readonly mode: 'trip'; readonly tripId: number }
    | { readonly mode: 'effective'; readonly effectiveDate: string },
): Promise<boolean> {
  const { allocateTransactionOnServer } = await import('@/lib/serverData')
  if (input.mode === 'trip') {
    const ok = await allocateTransactionOnServer(transactionId, {
      type: 'trip',
      trip_id: input.tripId,
    })
    if (ok) {
      const txs = storage.getTransactions()
      if (txs) {
        storage.saveTransactions(
          txs.map((t) =>
            t.id === transactionId ? { ...t, tripId: input.tripId } : t,
          ),
        )
      }
    }
    return ok
  }
  const eff = input.effectiveDate.slice(0, 10)
  const ok = await allocateTransactionOnServer(transactionId, {
    type: 'date',
    effective_date: eff,
  })
  if (ok) {
    const txs = storage.getTransactions()
    if (txs) {
      storage.saveTransactions(
        txs.map((t) =>
          t.id === transactionId ? { ...t, effectiveDate: eff } : t,
        ),
      )
    }
  }
  return ok
}

export async function clearTransactionAllocation(
  transactionId: string,
): Promise<boolean> {
  const { allocateTransactionOnServer } = await import('@/lib/serverData')
  const ok = await allocateTransactionOnServer(transactionId, { type: 'none' })
  if (ok) {
    const txs = storage.getTransactions()
    if (txs) {
      storage.saveTransactions(
        txs.map((t) =>
          t.id === transactionId
            ? { ...t, tripId: null, effectiveDate: null, myShare: null }
            : t,
        ),
      )
    }
  }
  return ok
}

export async function setTransactionMyShare(
  transactionId: string,
  myShare: number | null,
): Promise<boolean> {
  const { allocateTransactionOnServer } = await import('@/lib/serverData')
  return allocateTransactionOnServer(transactionId, {
    type: 'my_share',
    my_share: myShare,
  })
}
