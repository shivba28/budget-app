import { query } from './pool.js'

export type DbTripRow = {
  id: number
  user_id: string
  name: string
  start_date: string
  end_date: string | null
  budget_limit: string | null
  color: string | null
  created_at: string
}

export async function listTrips(userId: string): Promise<DbTripRow[]> {
  const { rows } = await query<DbTripRow>(
    `SELECT id, user_id, name, start_date::text, end_date::text, budget_limit::text, color,
            created_at::text
     FROM trips WHERE user_id = $1 ORDER BY start_date DESC, id DESC`,
    [userId],
  )
  return rows
}

export async function getTrip(
  userId: string,
  tripId: number,
): Promise<DbTripRow | null> {
  const { rows } = await query<DbTripRow>(
    `SELECT id, user_id, name, start_date::text, end_date::text, budget_limit::text, color,
            created_at::text
     FROM trips WHERE user_id = $1 AND id = $2 LIMIT 1`,
    [userId, tripId],
  )
  return rows[0] ?? null
}

export async function createTrip(params: {
  userId: string
  name: string
  startDate: string
  endDate: string | null
  budgetLimit: number | null
  color: string | null
}): Promise<number> {
  const { rows } = await query<{ id: number }>(
    `INSERT INTO trips (user_id, name, start_date, end_date, budget_limit, color)
     VALUES ($1, $2, $3::date, $4::date, $5, $6)
     RETURNING id`,
    [
      params.userId,
      params.name,
      params.startDate,
      params.endDate,
      params.budgetLimit,
      params.color,
    ],
  )
  return rows[0]!.id
}

export async function updateTrip(params: {
  userId: string
  tripId: number
  name?: string
  startDate?: string
  endDate?: string | null
  budgetLimit?: number | null
  color?: string | null
}): Promise<boolean> {
  const cur = await getTrip(params.userId, params.tripId)
  if (!cur) return false
  const name = params.name ?? cur.name
  const startDate = params.startDate ?? cur.start_date
  const endDate =
    params.endDate !== undefined ? params.endDate : cur.end_date
  const budgetLimit =
    params.budgetLimit !== undefined
      ? params.budgetLimit
      : cur.budget_limit !== null
        ? Number(cur.budget_limit)
        : null
  const color = params.color !== undefined ? params.color : cur.color
  const { rowCount } = await query(
    `UPDATE trips SET
       name = $3,
       start_date = $4::date,
       end_date = $5::date,
       budget_limit = $6,
       color = $7
     WHERE user_id = $1 AND id = $2`,
    [
      params.userId,
      params.tripId,
      name,
      startDate,
      endDate,
      budgetLimit,
      color,
    ],
  )
  return (rowCount ?? 0) > 0
}

export async function deleteTrip(userId: string, tripId: number): Promise<boolean> {
  const { rowCount } = await query(
    `DELETE FROM trips WHERE user_id = $1 AND id = $2`,
    [userId, tripId],
  )
  return (rowCount ?? 0) > 0
}
