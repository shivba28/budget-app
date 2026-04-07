import { dbEnabled } from '../db/pool.js'

import type { AuthenticatorDevice } from '@simplewebauthn/types'

import * as file from './credentialStoreFile.js'
import * as pg from './credentialStorePg.js'

export type StoredWebAuthnCredential = file.StoredWebAuthnCredential

export async function listCredentials(
  googleSub: string,
): Promise<StoredWebAuthnCredential[]> {
  if (dbEnabled()) return await pg.listCredentials(googleSub)
  return file.listCredentials(googleSub)
}

export async function hasAnyCredential(googleSub: string): Promise<boolean> {
  if (dbEnabled()) return await pg.hasAnyCredential(googleSub)
  return file.hasAnyCredential(googleSub)
}

export async function findCredentialById(
  credentialId: string,
): Promise<{ googleSub: string; credential: StoredWebAuthnCredential } | null> {
  if (dbEnabled()) return await pg.findCredentialById(credentialId)
  const found = file.findCredentialById(credentialId)
  if (!found) return null
  return { googleSub: found.googleSub, credential: found.credential }
}

export function toAuthenticatorDevice(
  c: StoredWebAuthnCredential,
): AuthenticatorDevice {
  return file.toAuthenticatorDevice(c)
}

export async function addCredential(
  googleSub: string,
  cred: Omit<StoredWebAuthnCredential, 'createdAt' | 'lastUsedAt'>,
): Promise<void> {
  if (dbEnabled()) return await pg.addCredential(googleSub, cred)
  return file.addCredential(googleSub, cred)
}

export async function updateCredentialAfterAuth(
  googleSub: string,
  credentialId: string,
  newCounter: number,
): Promise<void> {
  if (dbEnabled()) return await pg.updateCredentialAfterAuth(googleSub, credentialId, newCounter)
  return file.updateCredentialAfterAuth(googleSub, credentialId, newCounter)
}

export async function removeCredential(
  googleSub: string,
  credentialId: string,
): Promise<boolean> {
  if (dbEnabled()) return await pg.removeCredential(googleSub, credentialId)
  return file.removeCredential(googleSub, credentialId)
}

export async function credentialSummary(googleSub: string): Promise<{
  hasPasskeys: boolean
  credentialCount: number
  lastUsedAt: string | null
}> {
  if (dbEnabled()) return await pg.credentialSummary(googleSub)
  return file.credentialSummary(googleSub)
}

