import type { CookieOptions } from 'express'
import { config } from './config/env.js'

const partitionedEnabled = (): boolean => {
  if (config.cookieSameSite !== 'none') return false
  const raw = process.env['COOKIE_PARTITIONED']?.trim().toLowerCase()
  if (raw === '0' || raw === 'false' || raw === 'no') return false
  return true
}

const sessionCookieBase = (): Omit<CookieOptions, 'maxAge'> => ({
  httpOnly: true,
  secure: config.isProd || config.cookieSameSite === 'none',
  sameSite: config.cookieSameSite,
  path: '/',
  ...(partitionedEnabled() ? { partitioned: true as const } : {}),
})

/** Set-Cookie for `budget_sid`; must match {@link clearSessionCookieOptions} on logout. */
export function sessionCookieOptions(maxAgeMs: number): CookieOptions {
  return { ...sessionCookieBase(), maxAge: maxAgeMs }
}

/** Options for `clearCookie` so the browser drops the session cookie (incl. Partitioned). */
export function clearSessionCookieOptions(): CookieOptions {
  return { ...sessionCookieBase() }
}
