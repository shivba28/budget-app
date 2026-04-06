import type { Request, Response } from 'express'
import { getSession, touchSessionExpiry } from './sessionStoreFile.js'
import { bearerToken, sessionIdFromRequest } from './bearer.js'

export { bearerToken } from './bearer.js'

export function requireAuthSession(
  req: Request,
  res: Response,
): { sid: string; rec: NonNullable<ReturnType<typeof getSession>> } | null {
  const sid = sessionIdFromRequest(req)
  if (!sid) {
    res.status(401).json({ error: 'Unauthorized' })
    return null
  }
  const rec = getSession(sid)
  if (!rec) {
    res.status(401).json({ error: 'Unauthorized' })
    return null
  }
  touchSessionExpiry(sid)
  const fresh = getSession(sid)
  return { sid, rec: fresh ?? rec }
}
