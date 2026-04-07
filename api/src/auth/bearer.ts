import type { Request } from 'express'

const SESSION_COOKIE = 'budget_sid'

export function bearerToken(req: Request): string | null {
  const h = req.header('authorization')
  if (!h) return null
  const m = /^Bearer\s+(.+)\s*$/i.exec(h)
  return m?.[1] ?? null
}

export function sessionIdFromRequest(req: Request): string | null {
  const bearer = bearerToken(req)
  if (bearer) return bearer
  const anyReq = req as unknown as { cookies?: Record<string, unknown> }
  const sid = anyReq.cookies?.[SESSION_COOKIE]
  return typeof sid === 'string' && sid.trim() ? sid.trim() : null
}

export { SESSION_COOKIE }
