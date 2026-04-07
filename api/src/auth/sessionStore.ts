import { dbEnabled } from '../db/pool.js'

import * as file from './sessionStoreFile.js'
import * as pg from './sessionStorePg.js'

export type SessionRecord = pg.SessionRecord
export type TouchSessionExpiryOptions = file.TouchSessionExpiryOptions

function usingDb(): boolean {
  return dbEnabled()
}

export function sessionStoreKind(): 'pg' | 'file' {
  return usingDb() ? 'pg' : 'file'
}

export async function createSession(params: {
  refreshToken: string | null
  googleSub: string
  email: string
}): Promise<string> {
  if (usingDb()) return await pg.createSession(params)
  return file.createSession(params)
}

export async function getSession(sessionId: string): Promise<SessionRecord | null> {
  if (usingDb()) return await pg.getSession(sessionId)
  return file.getSession(sessionId)
}

export async function touchSessionExpiry(
  sessionId: string,
  opts?: TouchSessionExpiryOptions,
): Promise<void> {
  if (usingDb()) return await pg.touchSessionExpiry(sessionId, opts)
  return file.touchSessionExpiry(sessionId, opts)
}

export async function deleteSession(sessionId: string): Promise<void> {
  if (usingDb()) return await pg.deleteSession(sessionId)
  return file.deleteSession(sessionId)
}

export async function getRefreshToken(sessionId: string): Promise<string | null> {
  if (usingDb()) return await pg.getRefreshToken(sessionId)
  return file.getRefreshToken(sessionId)
}

export async function getLatestRefreshTokenForGoogleSub(
  googleSub: string,
): Promise<string | null> {
  if (usingDb()) return await pg.getLatestRefreshTokenForGoogleSub(googleSub)
  return file.getLatestRefreshTokenForGoogleSub(googleSub)
}

export async function updateSessionRecord(
  sessionId: string,
  patch: Parameters<typeof file.updateSessionRecord>[1],
): Promise<void> {
  if (usingDb()) return await pg.updateSessionRecord(sessionId, patch as any)
  return file.updateSessionRecord(sessionId, patch)
}

export async function setPinVerified(sessionId: string): Promise<void> {
  return setSecondFactorVerified(sessionId, 'pin')
}

export async function setSecondFactorVerified(
  sessionId: string,
  method: 'pin' | 'passkey',
): Promise<void> {
  if (usingDb()) return await pg.setSecondFactorVerified(sessionId, method)
  return file.setSecondFactorVerified(sessionId, method)
}

export async function clearPinUnlockForGoogleSub(googleSub: string): Promise<void> {
  if (usingDb()) return await pg.clearPinUnlockForGoogleSub(googleSub)
  return file.clearPinUnlockForGoogleSub(googleSub)
}

export function isPinUnlocked(rec: SessionRecord): boolean {
  return pg.isPinUnlocked(rec)
}

export async function getLatestEmailForGoogleSub(
  googleSub: string,
): Promise<string | null> {
  if (usingDb()) return await pg.getLatestEmailForGoogleSub(googleSub)
  return file.getLatestEmailForGoogleSub(googleSub)
}

