import type { Express, Request, Response } from 'express'
import express from 'express'
import {
  addSessionToken,
  clearSessionTokens,
  getTransactionsForAccount,
  removeSessionToken,
  tellerClient,
  TellerUpstreamError,
} from '../../teller/lib/tellerClient.js'

/**
 * Teller / bank proxy routes (same behavior as legacy backend on port 3000).
 * Mounted at /api/teller — e.g. POST /api/teller/auth/token.
 */
export function applyTellerRoutes(app: Express): void {
  const r = express.Router()

  r.post('/auth/token', (req: Request, res: Response) => {
    const body = req.body as { token?: unknown; enrollmentId?: unknown }
    const token = typeof body.token === 'string' ? body.token : ''
    let enrollmentId =
      typeof body.enrollmentId === 'string' ? body.enrollmentId.trim() : ''
    if (!enrollmentId) enrollmentId = 'default'
    if (!token.trim()) {
      res.status(400).json({ error: 'Missing token' })
      return
    }
    addSessionToken(enrollmentId, token)
    res.json({ ok: true, enrollmentId })
  })

  r.delete('/auth/token', (_req: Request, res: Response) => {
    clearSessionTokens()
    res.json({ ok: true })
  })

  r.delete('/auth/enrollment/:enrollmentId', (req: Request, res: Response) => {
    const raw = req.params.enrollmentId
    const enrollmentId = (Array.isArray(raw) ? raw[0] : raw)?.trim()
    if (!enrollmentId) {
      res.status(400).json({ error: 'Missing enrollment id' })
      return
    }
    removeSessionToken(enrollmentId)
    res.json({ ok: true })
  })

  r.get('/accounts', async (_req: Request, res: Response) => {
    try {
      const data = await tellerClient.getAccounts()
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

      const enrollmentId =
        typeof req.query.enrollment_id === 'string'
          ? req.query.enrollment_id.trim()
          : null

      const data = await getTransactionsForAccount(
        accountId,
        enrollmentId && enrollmentId.length > 0 ? enrollmentId : null,
      )
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
