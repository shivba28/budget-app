import type { Request } from 'express'

export function bearerToken(req: Request): string | null {
  const h = req.header('authorization')
  if (!h) return null
  const m = /^Bearer\s+(.+)\s*$/i.exec(h)
  return m?.[1] ?? null
}
