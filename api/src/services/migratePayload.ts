import { pool } from '../db/pool.js'
import { replaceBudgetsForUser, type MonthlyBudgetsPayload } from '../db/budgetsRepo.js'
import { upsertEnrollment } from '../db/enrollments.js'

type LegacyTrip = {
  id: number
  name: string
  startDate: string
  endDate?: string | null
  budgetLimit?: number | null
  color?: string | null
}

type LegacyTx = {
  id: string
  accountId: string
  date: string
  amount: number
  description: string
  categoryId?: string
  category?: string
  effectiveDate?: string | null
  tripId?: number | null
  detailCategory?: string | null
  pending?: boolean
}

type LegacyAccount = {
  id: string
  name: string
  enrollmentId?: string
  institution?: { name?: string }
}

export async function migrateUserPayload(
  userId: string,
  body: {
    accounts?: unknown
    transactions?: unknown
    trips?: unknown
    enrollments?: unknown
    monthlyBudgets?: unknown
  },
): Promise<{ tripsMapped: number; accountsInserted: number; txsInserted: number }> {
  if (!pool) throw new Error('Database not configured')

  const accounts = Array.isArray(body.accounts)
    ? (body.accounts as LegacyAccount[])
    : []
  const transactions = Array.isArray(body.transactions)
    ? (body.transactions as LegacyTx[])
    : []
  const trips = Array.isArray(body.trips) ? (body.trips as LegacyTrip[]) : []
  const enrollments = Array.isArray(body.enrollments)
    ? (body.enrollments as {
        enrollmentId: string
        accessToken: string
        institutionName?: string
      }[])
    : []

  let monthlyBudgets: MonthlyBudgetsPayload | null = null
  if (
    body.monthlyBudgets &&
    typeof body.monthlyBudgets === 'object' &&
    body.monthlyBudgets !== null
  ) {
    const mb = body.monthlyBudgets as Record<string, unknown>
    if (mb.v === 1 && mb.categories && typeof mb.categories === 'object') {
      monthlyBudgets = {
        v: 1,
        categories: mb.categories as Record<string, number>,
        totalMonthly:
          mb.totalMonthly === null || mb.totalMonthly === undefined
            ? null
            : Number(mb.totalMonthly),
      }
    }
  }

  const client = await pool.connect()
  let tripsMapped = 0
  let accountsInserted = 0
  let txsInserted = 0
  try {
    await client.query('BEGIN')

    const tripIdMap = new Map<number, number>()
    for (const t of trips) {
      const startD = t.startDate.slice(0, 10)
      const endD =
        t.endDate && t.endDate.length >= 10 ? t.endDate.slice(0, 10) : null
      let ins = await client.query<{ id: number }>(
        `INSERT INTO trips (user_id, name, start_date, end_date, budget_limit, color)
         VALUES ($1, $2, $3::date, $4::date, $5, $6)
         ON CONFLICT (user_id, name, start_date) DO NOTHING
         RETURNING id`,
        [userId, t.name, startD, endD, t.budgetLimit ?? null, t.color ?? null],
      )
      let newId = ins.rows[0]?.id
      if (newId === undefined) {
        const existing = await client.query<{ id: number }>(
          `SELECT id FROM trips WHERE user_id = $1 AND name = $2 AND start_date = $3::date LIMIT 1`,
          [userId, t.name, startD],
        )
        newId = existing.rows[0]?.id
      } else {
        tripsMapped += 1
      }
      if (newId !== undefined) tripIdMap.set(t.id, newId)
    }

    for (const a of accounts) {
      if (!a?.id || !a?.name) continue
      const inst =
        a.institution && typeof a.institution.name === 'string'
          ? a.institution.name
          : null
      const res = await client.query(
        `INSERT INTO accounts (id, user_id, name, institution, type, enrollment_id)
         VALUES ($1, $2, $3, $4, NULL, $5)
         ON CONFLICT (user_id, id) DO NOTHING`,
        [
          a.id,
          userId,
          a.name,
          inst,
          typeof a.enrollmentId === 'string' ? a.enrollmentId : null,
        ],
      )
      if ((res.rowCount ?? 0) > 0) accountsInserted += 1
    }

    for (const tx of transactions) {
      if (!tx?.id || !tx?.accountId || !tx?.date) continue
      const cat = tx.categoryId ?? tx.category ?? 'other'
      const oldTrip = tx.tripId ?? null
      const newTrip =
        oldTrip != null && tripIdMap.has(oldTrip) ? tripIdMap.get(oldTrip)! : null
      const res = await client.query(
        `INSERT INTO transactions (
           user_id, id, account_id, date, effective_date, trip_id, my_share, amount, description, category, detail_category, pending
         )
         VALUES ($1, $2, $3, $4::date, $5::date, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (user_id, id) DO NOTHING`,
        [
          userId,
          tx.id,
          tx.accountId,
          tx.date.slice(0, 10),
          tx.effectiveDate && tx.effectiveDate.length >= 7
            ? tx.effectiveDate.slice(0, 10)
            : null,
          newTrip,
          (tx as any).myShare ?? null,
          tx.amount,
          tx.description ?? '',
          cat,
          tx.detailCategory ?? null,
          tx.pending === true,
        ],
      )
      if ((res.rowCount ?? 0) > 0) txsInserted += 1
    }

    for (const e of enrollments) {
      if (!e.enrollmentId?.trim() || !e.accessToken?.trim()) continue
      await upsertEnrollment({
        userId,
        enrollmentId: e.enrollmentId.trim(),
        accessToken: e.accessToken.trim(),
        institutionName: e.institutionName ?? null,
      })
    }

    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }

  if (monthlyBudgets) {
    await replaceBudgetsForUser(userId, monthlyBudgets)
  }

  return { tripsMapped, accountsInserted, txsInserted }
}
