import type { NextFunction, Request, Response } from 'express'
import { dbEnabled } from '../db/pool.js'
import { sessionIdFromRequest } from './bearer.js'
import { getSession, touchSessionExpiry } from './sessionStoreFile.js'
import { upsertUser } from '../db/users.js'

export type AuthedRequest = Request & {
  auth?: { userId: string; email: string; sessionId: string }
}

export function requireUserSession(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!dbEnabled()) {
    next()
    return
  }
  const sid = sessionIdFromRequest(req)
  if (!sid) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  const rec = getSession(sid)
  if (!rec) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  touchSessionExpiry(sid)
  const auth = {
    userId: rec.googleSub,
    email: rec.email,
    sessionId: sid,
  }
  ;(req as AuthedRequest).auth = auth

  void (async () => {
    try {
      /**
       * If the user logged in while DATABASE_URL was unset, they can have a valid session
       * but no `users` row yet. Ensure it exists before any DB writes to avoid FK failures.
       */
      await upsertUser({
        id: auth.userId,
        email: auth.email,
        name: null,
        avatarUrl: null,
      })
      next()
    } catch (e) {
      console.error('[auth] ensure user row failed', e)
      res.status(503).json({ error: 'User database unavailable' })
    }
  })()
}

export function getUserId(req: Request): string | null {
  return (req as AuthedRequest).auth?.userId ?? null
}
