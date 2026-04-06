/**
 * Set allocation for a transaction (PATCH /api/user/transactions/:id/allocate).
 */
export async function allocateTransaction(
  transactionId: string,
  input:
    | { readonly mode: 'trip'; readonly tripId: number }
    | { readonly mode: 'effective'; readonly effectiveDate: string },
): Promise<boolean> {
  const { allocateTransactionOnServer } = await import('@/lib/serverData')
  if (input.mode === 'trip') {
    return allocateTransactionOnServer(transactionId, {
      type: 'trip',
      trip_id: input.tripId,
    })
  }
  return allocateTransactionOnServer(transactionId, {
    type: 'date',
    effective_date: input.effectiveDate.slice(0, 10),
  })
}

export async function clearTransactionAllocation(
  transactionId: string,
): Promise<boolean> {
  const { allocateTransactionOnServer } = await import('@/lib/serverData')
  return allocateTransactionOnServer(transactionId, { type: 'none' })
}
