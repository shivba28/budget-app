import type { Request, Response } from 'express'
import { getSession, touchSessionExpiry } from './sessionStore.js'
import { bearerToken, sessionIdFromRequest } from './bearer.js'

export { bearerToken } from './bearer.js'

export async function requireAuthSession(
  req: Request,
  res: Response,
): Promise<{
  sid: string
  rec: NonNullable<Awaited<ReturnType<typeof getSession>>>
} | null> {
  const sid = sessionIdFromRequest(req)
  if (!sid) {
    res.status(401).json({ error: 'Unauthorized' })
    return null
  }
  const rec = await getSession(sid)
  if (!rec) {
    res.status(401).json({ error: 'Unauthorized' })
    return null
  }
  await touchSessionExpiry(sid)
  const fresh = await getSession(sid)
  return { sid, rec: fresh ?? rec }
}
