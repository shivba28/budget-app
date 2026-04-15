import type { Express, Request, Response } from 'express'
import express from 'express'
import { getUserId, requireUserSession } from '../../auth/requireUser.js'
import { dbEnabled } from '../../db/pool.js'
import {
  clearEnrollmentsForUser,
  deleteEnrollment,
  listEnrollmentsForUser,
  upsertEnrollment,
} from '../../db/enrollments.js'
import {
  getEnrollmentForAccount,
  getLastSeenTxIdForAccount,
  getAccountTypeForUser,
  getDepositoryAmountsInvertedFlag,
  markDepositoryAmountsInverted,
  setLastSeenTxIdForAccount,
  upsertAccount,
} from '../../db/accountsRepo.js'
import {
  deleteSupersededPendingTransactionsForAccount,
  deleteTransactionsNotInFetchForAccountDateRange,
  getAllocationsForIds,
  upsertTransactionFromTeller,
} from '../../db/transactionsRepo.js'
import {
  tellerCategoryIdFromLabel,
  upsertCategory,
} from '../../db/categoriesRepo.js'
import { query } from '../../db/pool.js'
import {
  addSessionToken,
  clearSessionTokens,
  getAccountsAggregated,
  getTransactionsForAccount,
  removeSessionToken,
  TellerUpstreamError,
} from '../../teller/lib/tellerClient.js'
import { parseTellerTransaction, unwrapTransactionList } from '../../teller/txMap.js'

/**
 * Teller / bank proxy routes. Mounted at /api/teller.
 * When DATABASE_URL is set, Bearer session is required and tokens are stored per user in Postgres.
 */
export function applyTellerRoutes(app: Express): void {
  const r = express.Router()

  r.use((req: Request, res: Response, next) => {
    if (!dbEnabled()) return next()
    requireUserSession(req, res, next)
  })

  r.post('/auth/token', async (req: Request, res: Response) => {
    const body = req.body as {
      token?: unknown
      enrollmentId?: unknown
      institutionName?: unknown
    }
    const token = typeof body.token === 'string' ? body.token : ''
    let enrollmentId =
      typeof body.enrollmentId === 'string' ? body.enrollmentId.trim() : ''
    if (!enrollmentId) enrollmentId = 'default'
    if (!token.trim()) {
      res.status(400).json({ error: 'Missing token' })
      return
    }
    const institutionName =
      typeof body.institutionName === 'string' && body.institutionName.trim()
        ? body.institutionName.trim().slice(0, 200)
        : null
    if (dbEnabled()) {
      const userId = getUserId(req)
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }
      try {
        await upsertEnrollment({
          userId,
          enrollmentId,
          accessToken: token.trim(),
          institutionName,
        })
      } catch (e) {
        console.error('[teller] upsert enrollment', e)
        res.status(500).json({ error: 'Could not save enrollment token' })
        return
      }
      res.json({ ok: true, enrollmentId })
      return
    }
    addSessionToken(enrollmentId, token)
    res.json({ ok: true, enrollmentId })
  })

  r.delete('/auth/token', async (req: Request, res: Response) => {
    if (dbEnabled()) {
      const userId = getUserId(req)
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }
      try {
        await clearEnrollmentsForUser(userId)
      } catch (e) {
        console.error('[teller] clear enrollments', e)
        res.status(500).json({ error: 'Could not clear tokens' })
        return
      }
      res.json({ ok: true })
      return
    }
    clearSessionTokens()
    res.json({ ok: true })
  })

  r.delete('/auth/enrollment/:enrollmentId', async (req: Request, res: Response) => {
    const raw = req.params.enrollmentId
    const enrollmentId = (Array.isArray(raw) ? raw[0] : raw)?.trim()
    if (!enrollmentId) {
      res.status(400).json({ error: 'Missing enrollment id' })
      return
    }
    if (dbEnabled()) {
      const userId = getUserId(req)
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }
      try {
        await deleteEnrollment(userId, enrollmentId)
      } catch (e) {
        console.error('[teller] delete enrollment', e)
        res.status(500).json({ error: 'Could not remove enrollment' })
        return
      }
      res.json({ ok: true })
      return
    }
    removeSessionToken(enrollmentId)
    res.json({ ok: true })
  })

  r.get('/accounts', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req)
      const tokenMap =
        dbEnabled() && userId ? await listEnrollmentsForUser(userId) : null
      const data = await getAccountsAggregated(tokenMap)
      if (dbEnabled() && userId && Array.isArray(data)) {
        await Promise.all(
          (data as unknown[]).map(async (raw) => {
            if (!raw || typeof raw !== 'object') return
            const r = raw as Record<string, unknown>
            const id = typeof r.id === 'string' ? r.id : null
            if (!id) return
            const name = typeof r.name === 'string' ? r.name : null
            let inst: string | null = null
            if (
              r.institution &&
              typeof r.institution === 'object' &&
              r.institution !== null
            ) {
              const ins = r.institution as Record<string, unknown>
              if (typeof ins.name === 'string') inst = ins.name
            }
            const type = typeof r.type === 'string' ? r.type : null
            const enrollmentId =
              typeof r.enrollment_id === 'string'
                ? r.enrollment_id
                : typeof r.enrollmentId === 'string'
                  ? r.enrollmentId
                  : null
            await upsertAccount({
              userId,
              id,
              name,
              institution: inst,
              type,
              enrollmentId,
            })
          }),
        )
      }
      res.json(data)
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('GET /accounts failed', error)
      }
      const status = error instanceof TellerUpstreamError ? error.statusCode : 502
      const details = error instanceof Error ? error.message : String(error)
      const upstream =
        error instanceof TellerUpstreamError ? error.bodySnippet : undefined
      res.status(status).json({
        error: 'Teller accounts request failed',
        details,
        upstream,
      })
    }
  })

  r.get('/transactions', async (req: Request, res: Response) => {
    try {
      const accountId =
        typeof req.query.account_id === 'string' ? req.query.account_id : ''
      if (!accountId) {
        res.status(400).json({ error: 'Missing account_id query parameter' })
        return
      }

      let enrollmentId =
        typeof req.query.enrollment_id === 'string'
          ? req.query.enrollment_id.trim()
          : ''
      if (!enrollmentId) enrollmentId = ''

      const userId = getUserId(req)
      const tokenMap =
        dbEnabled() && userId ? await listEnrollmentsForUser(userId) : null

      let enrollParam: string | null =
        enrollmentId.length > 0 ? enrollmentId : null
      if (dbEnabled() && userId && !enrollParam) {
        enrollParam = await getEnrollmentForAccount(userId, accountId)
      }

      const shouldPersist = dbEnabled() && userId
      const stopAtId =
        shouldPersist && userId
          ? await getLastSeenTxIdForAccount(userId, accountId)
          : null

      // Pull newest-first, then paginate older pages until we hit stopAtId (quick sync),
      // or Teller returns a short page. Up to two waves of pages if the first hits the cap
      // (same as “ping twice” for deep history).
      //
      // IMPORTANT: Teller sometimes does not flip pending -> posted for existing ids during
      // incremental sync, which can leave pending rows stuck until reconnect. To keep recent
      // pending statuses fresh, always re-fetch the last ~30 days on every sync, ignoring
      // stopAtId within that window only.
      const PAGE_SIZE = 200
      const MAX_PAGES_PER_WAVE = 30
      const MAX_WAVES = 2
      const merged: unknown[] = []
      let fromId: string | null = null
      let newestId: string | null = null
      let hitStop = false
      let oldestDateSeen: string | null = null
      /** True only if the last wave ended on a full page at the per-wave cap (more may exist upstream). */
      let truncatedByPageCap = false

      const refreshMinIso = (() => {
        const d = new Date()
        d.setDate(d.getDate() - 30)
        return d.toISOString().slice(0, 10)
      })()

      const txIsoDate = (raw: unknown): string | null => {
        if (!raw || typeof raw !== 'object') return null
        const r = raw as Record<string, unknown>
        const ds = r.date
        if (typeof ds !== 'string' || ds.length < 10) return null
        return ds.slice(0, 10)
      }

      for (let wave = 0; wave < MAX_WAVES && !hitStop; wave++) {
        let waveTruncated = false
        for (let page = 0; page < MAX_PAGES_PER_WAVE && !hitStop; page++) {
          const pageData = await getTransactionsForAccount(
            accountId,
            enrollParam,
            tokenMap,
            { count: PAGE_SIZE, from_id: fromId },
          )
          const list = unwrapTransactionList(pageData)
          if (list.length === 0) break

          for (const raw of list) {
            if (!raw || typeof raw !== 'object') continue
            const r = raw as Record<string, unknown>
            const id = typeof r.id === 'string' ? r.id : null
            if (id && newestId === null) newestId = id
            const iso = txIsoDate(raw)
            if (iso && (oldestDateSeen === null || iso < oldestDateSeen)) {
              oldestDateSeen = iso
            }
            // Only honor stopAtId once we've fetched past the recent refresh window.
            if (stopAtId && id === stopAtId) {
              const allowStop = oldestDateSeen !== null && oldestDateSeen < refreshMinIso
              if (allowStop) {
                hitStop = true
                break
              }
            }
            merged.push(raw)
          }

          if (hitStop) break

          const last = list[list.length - 1]
          const lastId =
            last && typeof last === 'object' && typeof (last as any).id === 'string'
              ? ((last as any).id as string)
              : null
          if (!lastId) break
          fromId = lastId

          if (list.length < PAGE_SIZE) break
          if (page === MAX_PAGES_PER_WAVE - 1) waveTruncated = true
        }
        truncatedByPageCap = waveTruncated
        if (!waveTruncated) break
      }

      const data = { transactions: merged }

      if (shouldPersist && userId) {
        const accountTypeRaw = await getAccountTypeForUser({ userId, accountId })
        const accountType = accountTypeRaw?.toLowerCase() ?? null

        // One-time correction: if this is a depository account and existing rows were stored with inverted signs,
        // flip them once in-place so a "quick sync" still fixes historical transactions.
        if (accountType === 'depository') {
          const already = await getDepositoryAmountsInvertedFlag({ userId, accountId })
          if (!already) {
            await query(
              `UPDATE transactions
               SET amount = -amount
               WHERE user_id = $1 AND account_id = $2`,
              [userId, accountId],
            )
            await markDepositoryAmountsInverted({ userId, accountId })
          }
        }

        const list = unwrapTransactionList(data)
        const parsed: NonNullable<ReturnType<typeof parseTellerTransaction>>[] =
          []
        for (const raw of list) {
          const p = parseTellerTransaction(raw, accountId, { accountType })
          if (p) {
            parsed.push(p)
            // Auto-add/refresh categories seen from Teller.
            // Use detailCategory (raw Teller label) when available; otherwise use the mapped category string.
            const label = (p.detailCategory ?? p.category ?? '').trim()
            if (label) {
              const id = tellerCategoryIdFromLabel(label)
              await upsertCategory({
                userId,
                id,
                label,
                source: 'teller',
              })
              await upsertTransactionFromTeller({
                userId,
                ...p,
                category: id,
              })
            } else {
            await upsertTransactionFromTeller({ userId, ...p })
            }
          }
        }

        // Full tail fetch only: drop DB rows in the calendar range of this fetch whose ids
        // Teller did not return (e.g. removed pending). Skip on incremental sync or if capped.
        const canReconcileOrphans =
          stopAtId === null && !truncatedByPageCap && parsed.length > 0
        if (canReconcileOrphans) {
          let minDate = parsed[0]!.date
          let maxDate = parsed[0]!.date
          for (const p of parsed) {
            if (p.date < minDate) minDate = p.date
            if (p.date > maxDate) maxDate = p.date
          }
          await deleteTransactionsNotInFetchForAccountDateRange({
            userId,
            accountId,
            minDate,
            maxDate,
            keepIds: parsed.map((row) => row.id),
          })
        }

        if (newestId) {
          await setLastSeenTxIdForAccount({
            userId,
            accountId,
            lastSeenTxId: newestId,
          })
        }
        const ids = parsed.map((row) => row.id)
        const alloc = await getAllocationsForIds(userId, ids)
        for (const raw of list) {
          if (!raw || typeof raw !== 'object') continue
          const r = raw as Record<string, unknown>
          const id = typeof r.id === 'string' ? r.id : null
          if (!id) continue
          const a = alloc.get(id)
          if (a) {
            r.effective_date = a.effectiveDate
            r.trip_id = a.tripId
          }
        }
      }

      if (shouldPersist && userId) {
        await deleteSupersededPendingTransactionsForAccount({
          userId,
          accountId,
        })
      }

      res.json(data)
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('GET /transactions failed', error)
      }
      const status = error instanceof TellerUpstreamError ? error.statusCode : 502
      const details = error instanceof Error ? error.message : String(error)
      const upstream =
        error instanceof TellerUpstreamError ? error.bodySnippet : undefined
      res.status(status).json({
        error: 'Teller transactions request failed',
        details,
        upstream,
      })
    }
  })

  app.use('/api/teller', r)
}
