import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { config } from './config/env.js'
import { open, seal } from './crypto/secretBox.js'

const FILE_NAME = 'sessions.json'

export interface SessionRecord {
  encryptedRefreshToken: string
  googleSub: string
  email: string
  driveFileId?: string
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
}

interface StoreFile {
  sessions: Record<string, SessionRecord>
}

function storePath(): string {
  const dir = join(process.cwd(), config.dataDir)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return join(dir, FILE_NAME)
}

function readStore(): StoreFile {
  const path = storePath()
  if (!existsSync(path)) {
    return { sessions: {} }
  }
  try {
    const raw = readFileSync(path, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || !('sessions' in parsed)) {
      return { sessions: {} }
    }
    const sessions = (parsed as StoreFile).sessions
    if (!sessions || typeof sessions !== 'object') {
      return { sessions: {} }
    }
    return { sessions: sessions as Record<string, SessionRecord> }
  } catch {
    return { sessions: {} }
  }
}

function atomicWrite(path: string, data: string): void {
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(tmp, data, 'utf8')
  renameSync(tmp, path)
}

function writeStore(store: StoreFile): void {
  atomicWrite(storePath(), JSON.stringify(store, null, 2))
}

function defaultExpires(): string {
  return new Date(Date.now() + config.sessionMaxMs).toISOString()
}

export function createSession(params: {
  refreshToken: string
  googleSub: string
  email: string
}): string {
  const sessionId = randomBytes(32).toString('hex')
  const store = readStore()
  const now = new Date().toISOString()
  store.sessions[sessionId] = {
    encryptedRefreshToken: seal(params.refreshToken, config.sessionSecret),
    googleSub: params.googleSub,
    email: params.email,
    createdAt: now,
    expiresAt: defaultExpires(),
    pinFailures: 0,
  }
  writeStore(store)
  return sessionId
}

function migrateRecord(rec: SessionRecord): SessionRecord {
  if (!rec.expiresAt) {
    rec.expiresAt = defaultExpires()
  }
  if (typeof rec.pinFailures !== 'number') {
    rec.pinFailures = 0
  }
  return rec
}

export function getSession(sessionId: string): SessionRecord | null {
  const store = readStore()
  const rec = store.sessions[sessionId]
  if (!rec) return null
  const before = rec.expiresAt
  migrateRecord(rec)
  if (rec.expiresAt !== before) {
    writeStore(store)
  }
  const exp = Date.parse(rec.expiresAt)
  if (!Number.isFinite(exp) || exp <= Date.now()) {
    delete store.sessions[sessionId]
    writeStore(store)
    return null
  }
  return rec
}

/** Extend sliding session window (call on authenticated API use). */
export function touchSessionExpiry(sessionId: string): void {
  const store = readStore()
  const rec = store.sessions[sessionId]
  if (!rec) return
  rec.expiresAt = defaultExpires()
  writeStore(store)
}

export function deleteSession(sessionId: string): void {
  const store = readStore()
  if (store.sessions[sessionId]) {
    delete store.sessions[sessionId]
    writeStore(store)
  }
}

export function setDriveFileId(sessionId: string, driveFileId: string): void {
  const store = readStore()
  const rec = store.sessions[sessionId]
  if (rec) {
    rec.driveFileId = driveFileId
    writeStore(store)
  }
}

export function getRefreshToken(sessionId: string): string | null {
  const rec = getSession(sessionId)
  if (!rec) return null
  try {
    return open(rec.encryptedRefreshToken, config.sessionSecret)
  } catch {
    return null
  }
}

export function getLatestRefreshTokenForGoogleSub(
  googleSub: string,
): string | null {
  const store = readStore()
  let best: { rec: SessionRecord; exp: number } | null = null
  for (const rec of Object.values(store.sessions)) {
    if (rec.googleSub !== googleSub) continue
    migrateRecord(rec)
    const exp = Date.parse(rec.expiresAt)
    if (!Number.isFinite(exp) || exp <= Date.now()) continue
    if (!best || exp > best.exp) best = { rec, exp }
  }
  if (!best) return null
  try {
    return open(best.rec.encryptedRefreshToken, config.sessionSecret)
  } catch {
    return null
  }
}

export function updateSessionRecord(
  sessionId: string,
  patch: Partial<
    Pick<
      SessionRecord,
      | 'pinVerifiedUntil'
      | 'pinFailures'
      | 'pinLockedUntil'
      | 'expiresAt'
      | 'authMethod'
    >
  >,
): void {
  const store = readStore()
  const rec = store.sessions[sessionId]
  if (!rec) return
  Object.assign(rec, patch)
  writeStore(store)
}

export function setPinVerified(sessionId: string): void {
  setSecondFactorVerified(sessionId, 'pin')
}

export function setSecondFactorVerified(
  sessionId: string,
  method: 'pin' | 'passkey',
): void {
  const until = new Date(Date.now() + config.pinUnlockMs).toISOString()
  updateSessionRecord(sessionId, {
    pinVerifiedUntil: until,
    pinFailures: 0,
    pinLockedUntil: null,
    authMethod: method,
  })
}

/** After PIN reset via Google, no session should stay “unlocked” without the new PIN. */
export function clearPinUnlockForGoogleSub(googleSub: string): void {
  const store = readStore()
  let changed = false
  for (const rec of Object.values(store.sessions)) {
    if (rec.googleSub !== googleSub) continue
    if (rec.pinVerifiedUntil) {
      rec.pinVerifiedUntil = null
      changed = true
    }
  }
  if (changed) writeStore(store)
}

export function isPinUnlocked(rec: SessionRecord): boolean {
  if (!rec.pinVerifiedUntil) return false
  return Date.parse(rec.pinVerifiedUntil) > Date.now()
}

/** For passkey re-auth when no session: recover email from any non-expired session row. */
export function getLatestEmailForGoogleSub(googleSub: string): string | null {
  const store = readStore()
  let best: { email: string; exp: number } | null = null
  for (const rec of Object.values(store.sessions)) {
    if (rec.googleSub !== googleSub) continue
    migrateRecord(rec)
    const exp = Date.parse(rec.expiresAt)
    if (!Number.isFinite(exp) || exp <= Date.now()) continue
    if (!best || exp > best.exp) best = { email: rec.email, exp }
  }
  return best?.email ?? null
}
