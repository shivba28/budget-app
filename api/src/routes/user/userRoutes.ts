import type { Express, Request, Response } from 'express'
import express from 'express'
import { requireUserSession, getUserId } from '../../auth/requireUser.js'
import { dbEnabled } from '../../db/pool.js'
import { migrateUserPayload } from '../../services/migratePayload.js'
import {
  allocateTransaction,
  listTransactionsForUser,
  transactionBelongsToUser,
} from '../../db/transactionsRepo.js'
import {
  deleteCategoryForUser,
  listCategoriesForUser,
  updateCategoryColorForUser,
  upsertCategory,
  userCategoryIdFromLabel,
} from '../../db/categoriesRepo.js'
import {
  createTrip,
  deleteTrip,
  getTrip,
  listTrips,
  updateTrip,
} from '../../db/tripsRepo.js'
import { getBudgetsForUser, replaceBudgetsForUser } from '../../db/budgetsRepo.js'

function mustDb(res: Response): boolean {
  if (!dbEnabled()) {
    res.status(503).json({ error: 'Database not configured' })
    return false
  }
  return true
}

export function applyUserRoutes(app: Express): void {
  const r = express.Router()
  r.use(requireUserSession)

  r.post('/migrate', async (req: Request, res: Response) => {
    if (!mustDb(res)) return
    const userId = getUserId(req)
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    try {
      const result = await migrateUserPayload(userId, req.body ?? {})
      res.json({ ok: true, ...result })
    } catch (e) {
      console.error('[user/migrate]', e)
      res.status(500).json({ error: 'Migration failed' })
    }
  })

  r.get('/transactions', async (req: Request, res: Response) => {
    if (!mustDb(res)) return
    const userId = getUserId(req)
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    try {
      const rows = await listTransactionsForUser(userId)
      const transactions = rows.map((row) => ({
        id: row.id,
        accountId: row.account_id,
        date:
          typeof row.date === 'string'
            ? row.date.slice(0, 10)
            : String(row.date).slice(0, 10),
        amount: Number(row.amount),
        categoryId: row.category ?? 'other',
        description: row.description ?? '',
        detailCategory: row.detail_category ?? undefined,
        effectiveDate: row.effective_date,
        tripId: row.trip_id,
        myShare: row.my_share === null ? null : Number(row.my_share),
        pending: row.pending === true,
      }))
      res.json({ transactions })
    } catch (e) {
      console.error('[user/transactions]', e)
      res.status(500).json({ error: 'Could not load transactions' })
    }
  })

  r.get('/categories', async (req: Request, res: Response) => {
    if (!mustDb(res)) return
    const userId = getUserId(req)
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    try {
      const categories = await listCategoriesForUser(userId)
      res.json({ categories })
    } catch (e) {
      console.error('[user/categories GET]', e)
      res.status(500).json({ error: 'Could not load categories' })
    }
  })

  r.post('/categories', async (req: Request, res: Response) => {
    if (!mustDb(res)) return
    const userId = getUserId(req)
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    const body = req.body as Record<string, unknown>
    const label = typeof body.label === 'string' ? body.label.trim() : ''
    const color = typeof body.color === 'string' ? body.color : null
    if (!label) {
      res.status(400).json({ error: 'label is required' })
      return
    }
    const existing = await listCategoriesForUser(userId)
    const norm = label.toLowerCase()
    if (existing.some((c) => c.label.trim().toLowerCase() === norm)) {
      res.status(409).json({ error: 'A category with this name already exists' })
      return
    }

    const id = userCategoryIdFromLabel(label)
    try {
      await upsertCategory({ userId, id, label, color, source: 'user' })
      res.status(201).json({ id })
    } catch (e) {
      console.error('[user/categories POST]', e)
      res.status(500).json({ error: 'Could not create category' })
    }
  })

  r.patch('/categories/:id', async (req: Request, res: Response) => {
    if (!mustDb(res)) return
    const userId = getUserId(req)
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    const id = req.params.id
    if (!id) {
      res.status(400).json({ error: 'Missing id' })
      return
    }
    const body = req.body as Record<string, unknown>
    const color = typeof body.color === 'string' ? body.color : ''
    if (!color) {
      res.status(400).json({ error: 'color is required' })
      return
    }
    try {
      const ok = await updateCategoryColorForUser({ userId, id, color })
      if (!ok) {
        res.status(404).json({ error: 'Not found' })
        return
      }
      res.status(204).send()
    } catch (e) {
      console.error('[user/categories PATCH]', e)
      res.status(500).json({ error: 'Could not update category' })
    }
  })

  r.delete('/categories/:id', async (req: Request, res: Response) => {
    if (!mustDb(res)) return
    const userId = getUserId(req)
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    const id = req.params.id
    if (!id) {
      res.status(400).json({ error: 'Missing id' })
      return
    }
    try {
      const ok = await deleteCategoryForUser(userId, id)
      if (!ok) {
        res.status(404).json({ error: 'Not found' })
        return
      }
      res.status(204).send()
    } catch (e) {
      console.error('[user/categories DELETE]', e)
      res.status(500).json({ error: 'Could not delete category' })
    }
  })

  r.get('/trips', async (req: Request, res: Response) => {
    if (!mustDb(res)) return
    const userId = getUserId(req)
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    try {
      const rows = await listTrips(userId)
      res.json({
        trips: rows.map((t) => ({
          id: t.id,
          name: t.name,
          startDate: t.start_date.slice(0, 10),
          endDate: t.end_date ? t.end_date.slice(0, 10) : null,
          budgetLimit:
            t.budget_limit !== null && t.budget_limit !== undefined
              ? Number(t.budget_limit)
              : null,
          color: t.color,
          createdAt: t.created_at,
        })),
      })
    } catch (e) {
      console.error('[user/trips]', e)
      res.status(500).json({ error: 'Could not load trips' })
    }
  })

  r.post('/trips', async (req: Request, res: Response) => {
    if (!mustDb(res)) return
    const userId = getUserId(req)
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    const body = req.body as Record<string, unknown>
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const startDate =
      typeof body.start_date === 'string'
        ? body.start_date
        : typeof body.startDate === 'string'
          ? body.startDate
          : ''
    if (!name || startDate.length < 10) {
      res.status(400).json({ error: 'name and start_date are required' })
      return
    }
    const endRaw =
      typeof body.end_date === 'string'
        ? body.end_date
        : typeof body.endDate === 'string'
          ? body.endDate
          : null
    const endDate =
      endRaw && endRaw.length >= 10 ? endRaw.slice(0, 10) : null
    let budgetLimit: number | null = null
    const bl = body.budget_limit ?? body.budgetLimit
    if (bl !== null && bl !== undefined && bl !== '') {
      const n = Number(bl)
      if (!Number.isFinite(n) || n < 0) {
        res.status(400).json({ error: 'Invalid budget_limit' })
        return
      }
      budgetLimit = n
    }
    const color = typeof body.color === 'string' ? body.color : null
    try {
      const id = await createTrip({
        userId,
        name,
        startDate: startDate.slice(0, 10),
        endDate,
        budgetLimit,
        color,
      })
      res.status(201).json({ id })
    } catch (e) {
      console.error('[user/trips POST]', e)
      res.status(500).json({ error: 'Could not create trip' })
    }
  })

  r.patch('/trips/:id', async (req: Request, res: Response) => {
    if (!mustDb(res)) return
    const userId = getUserId(req)
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    const tripId = Number(req.params.id)
    if (!Number.isFinite(tripId)) {
      res.status(400).json({ error: 'Invalid id' })
      return
    }
    const existing = await getTrip(userId, tripId)
    if (!existing) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    const body = req.body as Record<string, unknown>
    const patch: Parameters<typeof updateTrip>[0] = {
      userId,
      tripId,
    }
    if (typeof body.name === 'string') patch.name = body.name.trim()
    if (typeof body.start_date === 'string') patch.startDate = body.start_date
    if (typeof body.startDate === 'string') patch.startDate = body.startDate
    if (body.end_date === null || body.endDate === null) patch.endDate = null
    else if (typeof body.end_date === 'string') patch.endDate = body.end_date
    else if (typeof body.endDate === 'string') patch.endDate = body.endDate
    if (body.budget_limit !== undefined || body.budgetLimit !== undefined) {
      const bl = body.budget_limit ?? body.budgetLimit
      if (bl === null) patch.budgetLimit = null
      else {
        const n = Number(bl)
        if (!Number.isFinite(n) || n < 0) {
          res.status(400).json({ error: 'Invalid budget_limit' })
          return
        }
        patch.budgetLimit = n
      }
    }
    if (typeof body.color === 'string' || body.color === null) {
      patch.color = body.color === null ? null : String(body.color)
    }
    try {
      const ok = await updateTrip(patch)
      if (!ok) {
        res.status(404).json({ error: 'Not found' })
        return
      }
      res.status(204).send()
    } catch (e) {
      console.error('[user/trips PATCH]', e)
      res.status(500).json({ error: 'Could not update trip' })
    }
  })

  r.delete('/trips/:id', async (req: Request, res: Response) => {
    if (!mustDb(res)) return
    const userId = getUserId(req)
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    const tripId = Number(req.params.id)
    if (!Number.isFinite(tripId)) {
      res.status(400).json({ error: 'Invalid id' })
      return
    }
    try {
      const ok = await deleteTrip(userId, tripId)
      if (!ok) {
        res.status(404).json({ error: 'Not found' })
        return
      }
      res.status(204).send()
    } catch (e) {
      console.error('[user/trips DELETE]', e)
      res.status(500).json({ error: 'Could not delete trip' })
    }
  })

  r.patch('/transactions/:id/allocate', async (req: Request, res: Response) => {
    if (!mustDb(res)) return
    const userId = getUserId(req)
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    const txId = req.params.id
    if (!txId) {
      res.status(400).json({ error: 'Missing id' })
      return
    }
    const okOwner = await transactionBelongsToUser(userId, txId)
    if (!okOwner) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    const body = req.body as {
      type?: unknown
      effective_date?: unknown
      trip_id?: unknown
      my_share?: unknown
    }
    const type = typeof body.type === 'string' ? body.type : ''
    try {
      if (type === 'none') {
        await allocateTransaction({
          userId,
          transactionId: txId,
          mode: 'none',
          effectiveDate: null,
          tripId: null,
          myShare: null,
        })
        res.status(204).send()
        return
      }
      if (type === 'date') {
        const d =
          typeof body.effective_date === 'string'
            ? body.effective_date
            : ''
        if (d.length < 10) {
          res.status(400).json({ error: 'effective_date required' })
          return
        }
        await allocateTransaction({
          userId,
          transactionId: txId,
          mode: 'date',
          effectiveDate: d.slice(0, 10),
          tripId: null,
          myShare: null,
        })
        res.status(204).send()
        return
      }
      if (type === 'trip') {
        const tid = Number(body.trip_id)
        if (!Number.isFinite(tid)) {
          res.status(400).json({ error: 'trip_id required' })
          return
        }
        const trip = await getTrip(userId, tid)
        if (!trip) {
          res.status(404).json({ error: 'Trip not found' })
          return
        }
        await allocateTransaction({
          userId,
          transactionId: txId,
          mode: 'trip',
          effectiveDate: null,
          tripId: tid,
          myShare: null,
        })
        res.status(204).send()
        return
      }
      if (type === 'my_share') {
        const raw = body.my_share
        const n =
          raw === null || raw === undefined
            ? null
            : typeof raw === 'number'
              ? raw
              : typeof raw === 'string'
                ? Number(raw)
                : NaN
        if (n !== null && (!Number.isFinite(n) || n < 0)) {
          res.status(400).json({ error: 'my_share must be null or a non-negative number' })
          return
        }
        await allocateTransaction({
          userId,
          transactionId: txId,
          mode: 'my_share',
          effectiveDate: null,
          tripId: null,
          myShare: n,
        })
        res.status(204).send()
        return
      }
      res.status(400).json({ error: 'Invalid type' })
    } catch (e) {
      console.error('[user/allocate]', e)
      res.status(500).json({ error: 'Could not update allocation' })
    }
  })

  r.get('/budgets', async (req: Request, res: Response) => {
    if (!mustDb(res)) return
    const userId = getUserId(req)
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    try {
      const payload = await getBudgetsForUser(userId)
      res.json(payload)
    } catch (e) {
      console.error('[user/budgets GET]', e)
      res.status(500).json({ error: 'Could not load budgets' })
    }
  })

  r.put('/budgets', async (req: Request, res: Response) => {
    if (!mustDb(res)) return
    const userId = getUserId(req)
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    const body = req.body as Record<string, unknown>
    if (body.v !== 1 || !body.categories || typeof body.categories !== 'object') {
      res.status(400).json({ error: 'Invalid body' })
      return
    }
    const totalMonthly =
      body.totalMonthly === null || body.totalMonthly === undefined
        ? null
        : Number(body.totalMonthly)
    if (totalMonthly !== null && (!Number.isFinite(totalMonthly) || totalMonthly < 0)) {
      res.status(400).json({ error: 'Invalid totalMonthly' })
      return
    }
    try {
      await replaceBudgetsForUser(userId, {
        v: 1,
        categories: body.categories as Record<string, number>,
        totalMonthly,
      })
      res.status(204).send()
    } catch (e) {
      console.error('[user/budgets PUT]', e)
      res.status(500).json({ error: 'Could not save budgets' })
    }
  })

  app.use('/api/user', r)
}
