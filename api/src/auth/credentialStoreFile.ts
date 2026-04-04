import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import type {
  AuthenticatorDevice,
  AuthenticatorTransportFuture,
} from '@simplewebauthn/types'
import { config } from './config/env.js'

const FILE_NAME = 'user-credentials.json'

export type StoredWebAuthnCredential = {
  credentialId: string
  /** base64url-encoded raw public key (COSE) */
  publicKey: string
  counter: number
  transports: string[]
  device: string
  name?: string
  createdAt: string
  lastUsedAt: string
}

interface StoreFile {
  credentials: Record<string, StoredWebAuthnCredential[]>
}

function storePath(): string {
  const dir = join(process.cwd(), config.dataDir)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return join(dir, FILE_NAME)
}

function readStore(): StoreFile {
  const p = storePath()
  if (!existsSync(p)) return { credentials: {} }
  try {
    const raw = readFileSync(p, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || !('credentials' in parsed)) {
      return { credentials: {} }
    }
    const c = (parsed as StoreFile).credentials
    if (!c || typeof c !== 'object') return { credentials: {} }
    return { credentials: c as Record<string, StoredWebAuthnCredential[]> }
  } catch {
    return { credentials: {} }
  }
}

function writeStore(s: StoreFile): void {
  const p = storePath()
  const tmp = `${p}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(tmp, JSON.stringify(s, null, 2), 'utf8')
  renameSync(tmp, p)
}

export function listCredentials(googleSub: string): StoredWebAuthnCredential[] {
  return readStore().credentials[googleSub] ?? []
}

export function hasAnyCredential(googleSub: string): boolean {
  return listCredentials(googleSub).length > 0
}

export function findCredentialById(
  credentialId: string,
): { googleSub: string; credential: StoredWebAuthnCredential; index: number } | null {
  const store = readStore()
  for (const [googleSub, list] of Object.entries(store.credentials)) {
    const index = list.findIndex((c) => c.credentialId === credentialId)
    if (index >= 0) {
      const credential = list[index]
      if (credential) {
        return { googleSub, credential, index }
      }
    }
  }
  return null
}

export function toAuthenticatorDevice(
  c: StoredWebAuthnCredential,
): AuthenticatorDevice {
  return {
    credentialID: c.credentialId,
    credentialPublicKey: new Uint8Array(Buffer.from(c.publicKey, 'base64url')),
    counter: c.counter,
    transports: c.transports as AuthenticatorTransportFuture[] | undefined,
  }
}

export function addCredential(
  googleSub: string,
  cred: Omit<StoredWebAuthnCredential, 'createdAt' | 'lastUsedAt'>,
): void {
  const store = readStore()
  const list = store.credentials[googleSub] ?? []
  if (list.some((x) => x.credentialId === cred.credentialId)) {
    throw new Error('Credential already registered')
  }
  const now = new Date().toISOString()
  list.push({
    ...cred,
    createdAt: now,
    lastUsedAt: now,
  })
  store.credentials[googleSub] = list
  writeStore(store)
}

export function updateCredentialAfterAuth(
  googleSub: string,
  credentialId: string,
  newCounter: number,
): void {
  const store = readStore()
  const list = store.credentials[googleSub]
  if (!list) return
  const c = list.find((x) => x.credentialId === credentialId)
  if (!c) return
  c.counter = newCounter
  c.lastUsedAt = new Date().toISOString()
  writeStore(store)
}

export function removeCredential(googleSub: string, credentialId: string): boolean {
  const store = readStore()
  const list = store.credentials[googleSub]
  if (!list) return false
  const next = list.filter((c) => c.credentialId !== credentialId)
  if (next.length === list.length) return false
  if (next.length === 0) delete store.credentials[googleSub]
  else store.credentials[googleSub] = next
  writeStore(store)
  return true
}

export function credentialSummary(googleSub: string): {
  hasPasskeys: boolean
  credentialCount: number
  lastUsedAt: string | null
} {
  const list = listCredentials(googleSub)
  if (list.length === 0) {
    return { hasPasskeys: false, credentialCount: 0, lastUsedAt: null }
  }
  let best = 0
  for (const c of list) {
    const t = Date.parse(c.lastUsedAt)
    if (Number.isFinite(t) && t > best) best = t
  }
  return {
    hasPasskeys: true,
    credentialCount: list.length,
    lastUsedAt: best > 0 ? new Date(best).toISOString() : list[0]?.lastUsedAt ?? null,
  }
}
