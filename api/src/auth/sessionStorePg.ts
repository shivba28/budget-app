import { randomBytes } from 'node:crypto'
import { config } from './config/env.js'
import { open, seal } from './crypto/secretBox.js'
import { query } from '../db/pool.js'

export interface SessionRecord {
  /** Empty string when no Google refresh token is stored for this session. */
  encryptedRefreshToken: string
  googleSub: string
  email: string
  createdAt: string
  /** Sliding session expiry */
  expiresAt: string
  /**
   * Second-factor satisfied until (PIN or passkey unlock).
   * Name kept for backwards compatibility with existing sessions.json.
   */
  pinVerifiedUntil?: string | null
  pinFailures: number
  pinLockedUntil?: string | null
  /** Last successful second factor */
  authMethod?: 'pin' | 'passkey'
  /** ISO time of last request that counted as user activity while PIN-unlocked */
  pinLastActivityAt?: string | null
}

function iso(v: unknown): string {
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'string') return v
  return new Date(String(v)).toISOString()
}

function rowToRecord(row: Record<string, unknown>): SessionRecord {
  return {
    encryptedRefreshToken: String(row.encrypted_refresh_token ?? ''),
    googleSub: String(row.google_sub ?? ''),
    email: String(row.email ?? ''),
    createdAt: iso(row.created_at),
    expiresAt: iso(row.expires_at),
    pinVerifiedUntil: row.pin_verified_until ? iso(row.pin_verified_until) : null,
    pinFailures:
      typeof row.pin_failures === 'number'
        ? row.pin_failures
        : Number(row.pin_failures ?? 0),
    pinLockedUntil: row.pin_locked_until ? iso(row.pin_locked_until) : null,
    authMethod:
      row.auth_method === 'pin' || row.auth_method === 'passkey'
        ? row.auth_method
        : undefined,
    pinLastActivityAt: row.pin_last_activity_at
      ? iso(row.pin_last_activity_at)
      : null,
  }
}

function defaultExpiresIso(): string {
  return new Date(Date.now() + config.sessionMaxMs).toISOString()
}

export async function createSession(params: {
  refreshToken: string | null
  googleSub: string
  email: string
}): Promise<string> {
  const id = randomBytes(32).toString('hex')
  const now = new Date().toISOString()
  const expiresAt = defaultExpiresIso()
  const encryptedRefreshToken = params.refreshToken
    ? seal(params.refreshToken, config.sessionSecret)
    : ''
  await query(
    `
      insert into sessions (
        id,
        encrypted_refresh_token,
        google_sub,
        email,
        created_at,
        expires_at,
        pin_verified_until,
        pin_last_activity_at,
        pin_failures,
        pin_locked_until,
        auth_method
      )
      values ($1,$2,$3,$4,$5,$6,null,null,0,null,null)
    `,
    [id, encryptedRefreshToken, params.googleSub, params.email, now, expiresAt],
  )
  return id
}

export async function getSession(sessionId: string): Promise<SessionRecord | null> {
  const r = await query<Record<string, unknown>>(
    `
      select
        encrypted_refresh_token,
        google_sub,
        email,
        created_at,
        expires_at,
        pin_verified_until,
        pin_last_activity_at,
        pin_failures,
        pin_locked_until,
        auth_method
      from sessions
      where id = $1
      limit 1
    `,
    [sessionId],
  )
  const row = r.rows[0]
  if (!row) return null
  const rec = rowToRecord(row)
  const exp = Date.parse(rec.expiresAt)
  if (!Number.isFinite(exp) || exp <= Date.now()) {
    await deleteSession(sessionId)
    return null
  }
  return rec
}

export async function touchSessionExpiry(
  sessionId: string,
  opts?: { extendPinActivity?: boolean },
): Promise<void> {
  const extendPin = opts?.extendPinActivity !== false
  const now = new Date().toISOString()
  const expiresAt = defaultExpiresIso()

  if (!extendPin) {
    await query(`update sessions set expires_at = $2 where id = $1`, [
      sessionId,
      expiresAt,
    ])
    return
  }

  // Only extend PIN activity if currently unlocked.
  const rec = await getSession(sessionId)
  if (!rec) return
  const pinUnlocked = isPinUnlocked(rec)
  await query(
    `
      update sessions
      set
        expires_at = $2,
        pin_last_activity_at = case when $3 then $4 else pin_last_activity_at end
      where id = $1
    `,
    [sessionId, expiresAt, pinUnlocked, now],
  )
}

export async function deleteSession(sessionId: string): Promise<void> {
  await query(`delete from sessions where id = $1`, [sessionId])
}

export async function getRefreshToken(sessionId: string): Promise<string | null> {
  const rec = await getSession(sessionId)
  if (!rec || !rec.encryptedRefreshToken) return null
  try {
    return open(rec.encryptedRefreshToken, config.sessionSecret)
  } catch {
    return null
  }
}

export async function getLatestRefreshTokenForGoogleSub(
  googleSub: string,
): Promise<string | null> {
  const r = await query<Record<string, unknown>>(
    `
      select encrypted_refresh_token, expires_at
      from sessions
      where google_sub = $1
      order by expires_at desc
      limit 1
    `,
    [googleSub],
  )
  const row = r.rows[0]
  if (!row) return null
  const exp = Date.parse(iso(row.expires_at))
  if (!Number.isFinite(exp) || exp <= Date.now()) return null
  const encrypted = String(row.encrypted_refresh_token ?? '')
  if (!encrypted) return null
  try {
    return open(encrypted, config.sessionSecret)
  } catch {
    return null
  }
}

export async function updateSessionRecord(
  sessionId: string,
  patch: Partial<
    Pick<
      SessionRecord,
      | 'pinVerifiedUntil'
      | 'pinFailures'
      | 'pinLockedUntil'
      | 'expiresAt'
      | 'authMethod'
      | 'pinLastActivityAt'
    >
  >,
): Promise<void> {
  const sets: string[] = []
  const vals: unknown[] = [sessionId]
  let idx = 2
  const add = (col: string, v: unknown): void => {
    sets.push(`${col} = $${idx++}`)
    vals.push(v)
  }

  if ('pinVerifiedUntil' in patch) add('pin_verified_until', patch.pinVerifiedUntil)
  if ('pinFailures' in patch) add('pin_failures', patch.pinFailures ?? 0)
  if ('pinLockedUntil' in patch) add('pin_locked_until', patch.pinLockedUntil)
  if ('expiresAt' in patch) add('expires_at', patch.expiresAt ?? defaultExpiresIso())
  if ('authMethod' in patch) add('auth_method', patch.authMethod ?? null)
  if ('pinLastActivityAt' in patch)
    add('pin_last_activity_at', patch.pinLastActivityAt)

  if (sets.length === 0) return
  await query(`update sessions set ${sets.join(', ')} where id = $1`, vals)
}

export async function setSecondFactorVerified(
  sessionId: string,
  method: 'pin' | 'passkey',
): Promise<void> {
  const now = new Date().toISOString()
  const until = new Date(Date.now() + config.pinUnlockMs).toISOString()
  await updateSessionRecord(sessionId, {
    pinVerifiedUntil: until,
    pinLastActivityAt: now,
    pinFailures: 0,
    pinLockedUntil: null,
    authMethod: method,
  })
}

export async function clearPinUnlockForGoogleSub(googleSub: string): Promise<void> {
  await query(
    `
      update sessions
      set pin_verified_until = null, pin_last_activity_at = null
      where google_sub = $1
    `,
    [googleSub],
  )
}

export function isPinUnlocked(rec: SessionRecord): boolean {
  if (!rec.pinVerifiedUntil) return false
  if (Date.parse(rec.pinVerifiedUntil) <= Date.now()) return false
  if (config.pinInactivityTimeoutMs <= 0) return true
  const last = rec.pinLastActivityAt
  if (!last) return true
  return Date.now() - Date.parse(last) < config.pinInactivityTimeoutMs
}

export async function getLatestEmailForGoogleSub(
  googleSub: string,
): Promise<string | null> {
  const r = await query<Record<string, unknown>>(
    `
      select email, expires_at
      from sessions
      where google_sub = $1
      order by expires_at desc
      limit 1
    `,
    [googleSub],
  )
  const row = r.rows[0]
  if (!row) return null
  const exp = Date.parse(iso(row.expires_at))
  if (!Number.isFinite(exp) || exp <= Date.now()) return null
  const email = String(row.email ?? '')
  return email.trim() ? email : null
}

