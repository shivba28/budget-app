import { query } from './pool.js'

export type DbTransactionRow = {
  user_id: string
  id: string
  account_id: string
  date: string
  effective_date: string | null
  trip_id: number | null
  my_share: string | null
  amount: string
  description: string | null
  category: string | null
  detail_category: string | null
  pending: boolean | null
}

export async function upsertTransactionFromTeller(params: {
  userId: string
  id: string
  accountId: string
  date: string
  amount: number
  description: string
  category: string
  detailCategory: string | null
  pending: boolean
}): Promise<void> {
  await query(
    `INSERT INTO transactions (
       user_id, id, account_id, date, amount, description, category, detail_category, pending
     )
     VALUES ($1, $2, $3, $4::date, $5, $6, $7, $8, $9)
     ON CONFLICT (user_id, id) DO UPDATE SET
       account_id = EXCLUDED.account_id,
       date = EXCLUDED.date,
       amount = EXCLUDED.amount,
       description = EXCLUDED.description,
       category = EXCLUDED.category,
       detail_category = EXCLUDED.detail_category,
       pending = EXCLUDED.pending`,
    [
      params.userId,
      params.id,
      params.accountId,
      params.date,
      params.amount,
      params.description,
      params.category,
      params.detailCategory,
      params.pending,
    ],
  )
}

export async function getAllocationsForIds(
  userId: string,
  ids: string[],
): Promise<Map<string, { effectiveDate: string | null; tripId: number | null }>> {
  const out = new Map<string, { effectiveDate: string | null; tripId: number | null }>()
  if (ids.length === 0) return out
  const { rows } = await query<{
    id: string
    effective_date: string | null
    trip_id: number | null
  }>(
    `SELECT id, effective_date, trip_id FROM transactions
     WHERE user_id = $1 AND id = ANY($2::text[])`,
    [userId, ids],
  )
  for (const r of rows) {
    out.set(r.id, {
      effectiveDate: r.effective_date,
      tripId: r.trip_id,
    })
  }
  return out
}

export async function listTransactionsForUser(userId: string): Promise<DbTransactionRow[]> {
  const { rows } = await query<DbTransactionRow>(
    `SELECT user_id, id, account_id, date::text AS date, effective_date::text AS effective_date,
            trip_id, my_share::text AS my_share, amount::text AS amount, description, category, detail_category, pending
     FROM transactions WHERE user_id = $1 ORDER BY date DESC, id DESC`,
    [userId],
  )
  return rows
}

export async function transactionBelongsToUser(
  userId: string,
  transactionId: string,
): Promise<boolean> {
  const { rows } = await query<{ n: string }>(
    `SELECT 1 AS n FROM transactions WHERE user_id = $1 AND id = $2 LIMIT 1`,
    [userId, transactionId],
  )
  return rows.length > 0
}

/**
 * Remove pending rows that are superseded by a posted duplicate (same account, amount,
 * description, dates within a few days). Teller often issues a new id when a charge
 * posts, leaving the old pending row in our DB until sync — this cleans that up.
 */
/**
 * Remove rows for this account whose posting `date` falls in [minDate, maxDate] but whose
 * id was not returned in the latest Teller fetch. Only call when the fetch covered the full
 * tail to Teller’s end (no incremental stop, no page-cap truncation).
 */
export async function deleteTransactionsNotInFetchForAccountDateRange(params: {
  userId: string
  accountId: string
  minDate: string
  maxDate: string
  keepIds: readonly string[]
}): Promise<number> {
  if (params.keepIds.length === 0) return 0
  const { rowCount } = await query(
    `DELETE FROM transactions
     WHERE user_id = $1
       AND account_id = $2
       AND date >= $3::date
       AND date <= $4::date
       AND NOT (id = ANY($5::text[]))`,
    [params.userId, params.accountId, params.minDate, params.maxDate, params.keepIds],
  )
  return rowCount ?? 0
}

export async function deleteSupersededPendingTransactionsForAccount(params: {
  userId: string
  accountId: string
}): Promise<number> {
  const { rowCount } = await query(
    `DELETE FROM transactions AS t_del
     WHERE t_del.user_id = $1
       AND t_del.account_id = $2
       AND t_del.pending = true
       AND EXISTS (
         SELECT 1 FROM transactions AS t_keep
         WHERE t_keep.user_id = t_del.user_id
           AND t_keep.account_id = t_del.account_id
           AND t_keep.pending = false
           AND t_keep.amount = t_del.amount
           AND lower(trim(both from coalesce(t_keep.description, '')))
               = lower(trim(both from coalesce(t_del.description, '')))
           AND abs((t_keep.date::date - t_del.date::date)) <= 5
           AND t_keep.id <> t_del.id
       )`,
    [params.userId, params.accountId],
  )
  return rowCount ?? 0
}

export async function allocateTransaction(params: {
  userId: string
  transactionId: string
  mode: 'date' | 'trip' | 'none' | 'my_share'
  effectiveDate: string | null
  tripId: number | null
  myShare: number | null
}): Promise<void> {
  if (params.mode === 'none') {
    await query(
      `UPDATE transactions SET effective_date = NULL, trip_id = NULL, my_share = NULL
       WHERE user_id = $1 AND id = $2`,
      [params.userId, params.transactionId],
    )
    return
  }
  if (params.mode === 'date') {
    await query(
      `UPDATE transactions SET effective_date = $3::date, trip_id = NULL
       WHERE user_id = $1 AND id = $2`,
      [params.userId, params.transactionId, params.effectiveDate],
    )
    return
  }
  if (params.mode === 'my_share') {
    await query(
      `UPDATE transactions SET my_share = $3
       WHERE user_id = $1 AND id = $2`,
      [params.userId, params.transactionId, params.myShare],
    )
    return
  }
  await query(
    `UPDATE transactions SET trip_id = $3, effective_date = NULL
     WHERE user_id = $1 AND id = $2`,
    [params.userId, params.transactionId, params.tripId],
  )
}
