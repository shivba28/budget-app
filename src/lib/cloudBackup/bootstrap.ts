import { applyCloudBackupPayload } from './apply'
import { collectLocalBackup } from './collect'
import { recordDriveSyncFailure, recordDriveSyncSuccess } from './driveSyncStatus'
import {
  setStoredCloudBackupEnvelopeAt,
  shouldRestoreRemoteOverLocal,
} from './envelopeAt'
import { parseCloudBackupJson } from './types'
import { SESSION_BOOTSTRAP_KEY } from './keys'
import { pushBackupToServer, pullBackupFromServer } from '../syncApi'

export async function runDriveBootstrap(): Promise<{
  ok: true
  message: string
} | { ok: false; message: string }> {
  try {
    const already = window.sessionStorage.getItem(SESSION_BOOTSTRAP_KEY) === '1'
    if (already) {
      return { ok: true, message: 'Already synced this session.' }
    }

    const local = await collectLocalBackup()
    const remoteText = await pullBackupFromServer()
    const remote = remoteText ? parseCloudBackupJson(remoteText) : null

    if (!remote) {
      await pushBackupToServer(local)
      setStoredCloudBackupEnvelopeAt(local.updatedAt)
      recordDriveSyncSuccess()
      window.sessionStorage.setItem(SESSION_BOOTSTRAP_KEY, '1')
      return { ok: true, message: 'Backed up to Google Drive.' }
    }

    const shouldRestore = shouldRestoreRemoteOverLocal(local, remote)

    if (shouldRestore) {
      await applyCloudBackupPayload(remote)
      recordDriveSyncSuccess()
      window.sessionStorage.setItem(SESSION_BOOTSTRAP_KEY, '1')
      window.location.reload()
      return { ok: true, message: 'Restored from Google Drive.' }
    }

    const toPush = await collectLocalBackup()
    await pushBackupToServer(toPush)
    setStoredCloudBackupEnvelopeAt(toPush.updatedAt)
    recordDriveSyncSuccess()
    window.sessionStorage.setItem(SESSION_BOOTSTRAP_KEY, '1')
    return { ok: true, message: 'Backed up to Google Drive.' }
  } catch (e) {
    recordDriveSyncFailure(e instanceof Error ? e.message : 'Drive sync failed')
    return {
      ok: false,
      message: e instanceof Error ? e.message : 'Drive sync failed',
    }
  }
}

export function clearBootstrapSessionFlag(): void {
  try {
    window.sessionStorage.removeItem(SESSION_BOOTSTRAP_KEY)
  } catch {
    // ignore
  }
}
