import { query } from './pool.js'

const DEFAULT_MONTH = 'default'

export type MonthlyBudgetsPayload = {
  v: 1
  categories: Record<string, number>
  totalMonthly: number | null
}

export async function getBudgetsForUser(userId: string): Promise<MonthlyBudgetsPayload> {
  const { rows } = await query<{ category: string; amount: string }>(
    `SELECT category, amount::text FROM budgets WHERE user_id = $1 AND month = $2`,
    [userId, DEFAULT_MONTH],
  )
  const categories: Record<string, number> = {}
  let totalMonthly: number | null = null
  for (const r of rows) {
    if (r.category === '__total_cap__') {
      totalMonthly = Number(r.amount)
    } else {
      categories[r.category] = Number(r.amount)
    }
  }
  return { v: 1, categories, totalMonthly }
}

export async function replaceBudgetsForUser(
  userId: string,
  payload: MonthlyBudgetsPayload,
): Promise<void> {
  await query(`DELETE FROM budgets WHERE user_id = $1 AND month = $2`, [
    userId,
    DEFAULT_MONTH,
  ])
  for (const [category, amount] of Object.entries(payload.categories)) {
    if (!Number.isFinite(amount) || amount < 0) continue
    await query(
      `INSERT INTO budgets (user_id, category, amount, month) VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, category, month) DO UPDATE SET amount = EXCLUDED.amount`,
      [userId, category, amount, DEFAULT_MONTH],
    )
  }
  if (payload.totalMonthly !== null && Number.isFinite(payload.totalMonthly)) {
    await query(
      `INSERT INTO budgets (user_id, category, amount, month) VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, category, month) DO UPDATE SET amount = EXCLUDED.amount`,
      [userId, '__total_cap__', payload.totalMonthly, DEFAULT_MONTH],
    )
  }
}
