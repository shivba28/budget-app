import { query } from './pool.js'

export type DbTransactionRow = {
  user_id: string
  id: string
  account_id: string
  date: string
  effective_date: string | null
  trip_id: number | null
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
            trip_id, amount::text AS amount, description, category, detail_category, pending
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

export async function allocateTransaction(params: {
  userId: string
  transactionId: string
  mode: 'date' | 'trip' | 'none'
  effectiveDate: string | null
  tripId: number | null
}): Promise<void> {
  if (params.mode === 'none') {
    await query(
      `UPDATE transactions SET effective_date = NULL, trip_id = NULL
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
  await query(
    `UPDATE transactions SET trip_id = $3, effective_date = NULL
     WHERE user_id = $1 AND id = $2`,
    [params.userId, params.transactionId, params.tripId],
  )
}
