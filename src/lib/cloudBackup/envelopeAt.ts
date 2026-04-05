import { KEYS } from '@/lib/storage'
import { CLOUD_BACKUP_ENVELOPE_AT_KEY } from './keys'
import type { CloudBackupPayload } from './types'

export function getStoredCloudBackupEnvelopeAtMs(): number | null {
  if (typeof window === 'undefined' || !window.localStorage) return null
  try {
    const raw = window.localStorage.getItem(CLOUD_BACKUP_ENVELOPE_AT_KEY)
    if (!raw || raw.trim() === '') return null
    const t = Date.parse(raw)
    return Number.isFinite(t) ? t : null
  } catch {
    return null
  }
}

export function setStoredCloudBackupEnvelopeAt(iso: string): void {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    window.localStorage.setItem(CLOUD_BACKUP_ENVELOPE_AT_KEY, iso)
  } catch {
    // quota
  }
}

export function countTransactionsInSnapshot(ls: Record<string, string>): number {
  const raw = ls[KEYS.transactions]
  if (!raw || raw.trim() === '') return 0
  try {
    const arr = JSON.parse(raw) as unknown
    return Array.isArray(arr) ? arr.length : 0
  } catch {
    return 0
  }
}

/**
 * Merge decision: compare remote file `updatedAt` to the last merged envelope (not `collectLocalBackup().updatedAt`,
 * which is always "now"). Also restore when local has no transactions / empty snapshot but remote does.
 */
export function shouldRestoreRemoteOverLocal(
  local: CloudBackupPayload,
  remote: CloudBackupPayload,
): boolean {
  const remoteTs = Date.parse(remote.updatedAt)
  const localEnvMs = getStoredCloudBackupEnvelopeAtMs()

  const localLs = local.localStorage
  const remoteLs = remote.localStorage
  const localKeyCount = Object.keys(localLs).length
  const remoteKeyCount = Object.keys(remoteLs).length
  const localTx = countTransactionsInSnapshot(localLs)
  const remoteTx = countTransactionsInSnapshot(remoteLs)

  if (
    localEnvMs !== null &&
    Number.isFinite(remoteTs) &&
    remoteTs > localEnvMs
  ) {
    return true
  }

  // Offline-first: local transactions but never recorded a merge — upload before pulling by time.
  if (localEnvMs === null && localTx > 0) {
    return false
  }

  if (localKeyCount === 0 && remoteKeyCount > 0) {
    return true
  }

  if (localTx === 0 && remoteTx > 0) {
    return true
  }

  return false
}
