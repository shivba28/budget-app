import { query } from './pool.js'

export async function upsertAccount(params: {
  userId: string
  id: string
  name: string | null
  institution: string | null
  type: string | null
  enrollmentId: string | null
}): Promise<void> {
  await query(
    `INSERT INTO accounts (id, user_id, name, institution, type, enrollment_id, last_synced, last_seen_tx_id)
     VALUES ($1, $2, $3, $4, $5, $6, NOW(), NULL)
     ON CONFLICT (user_id, id) DO UPDATE SET
       name = EXCLUDED.name,
       institution = EXCLUDED.institution,
       type = EXCLUDED.type,
       enrollment_id = EXCLUDED.enrollment_id,
       last_synced = NOW()`,
    [
      params.id,
      params.userId,
      params.name,
      params.institution,
      params.type,
      params.enrollmentId,
    ],
  )
}

export async function getLastSeenTxIdForAccount(
  userId: string,
  accountId: string,
): Promise<string | null> {
  const { rows } = await query<{ last_seen_tx_id: string | null }>(
    `SELECT last_seen_tx_id FROM accounts WHERE user_id = $1 AND id = $2 LIMIT 1`,
    [userId, accountId],
  )
  const v = rows[0]?.last_seen_tx_id
  return typeof v === 'string' && v.trim() ? v : null
}

export async function setLastSeenTxIdForAccount(params: {
  userId: string
  accountId: string
  lastSeenTxId: string
}): Promise<void> {
  await query(
    `UPDATE accounts SET last_seen_tx_id = $3 WHERE user_id = $1 AND id = $2`,
    [params.userId, params.accountId, params.lastSeenTxId],
  )
}

export async function accountBelongsToUser(
  userId: string,
  accountId: string,
): Promise<boolean> {
  const { rows } = await query<{ n: string }>(
    `SELECT 1 AS n FROM accounts WHERE user_id = $1 AND id = $2 LIMIT 1`,
    [userId, accountId],
  )
  return rows.length > 0
}

export async function getEnrollmentForAccount(
  userId: string,
  accountId: string,
): Promise<string | null> {
  const { rows } = await query<{ enrollment_id: string | null }>(
    `SELECT enrollment_id FROM accounts WHERE user_id = $1 AND id = $2 LIMIT 1`,
    [userId, accountId],
  )
  const e = rows[0]?.enrollment_id
  return typeof e === 'string' && e.length > 0 ? e : null
}
