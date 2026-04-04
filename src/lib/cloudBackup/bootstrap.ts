import { applyCloudBackupPayload } from './apply'
import { collectLocalBackup } from './collect'
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
      window.sessionStorage.setItem(SESSION_BOOTSTRAP_KEY, '1')
      return { ok: true, message: 'Backed up to Google Drive.' }
    }

    const localTs = Date.parse(local.updatedAt)
    const remoteTs = Date.parse(remote.updatedAt)
    const shouldRestore =
      Number.isFinite(remoteTs) && Number.isFinite(localTs)
        ? remoteTs > localTs
        : Boolean(remote.updatedAt && !local.updatedAt)

    if (shouldRestore) {
      await applyCloudBackupPayload(remote)
      window.sessionStorage.setItem(SESSION_BOOTSTRAP_KEY, '1')
      window.location.reload()
      return { ok: true, message: 'Restored from Google Drive.' }
    }

    await pushBackupToServer(await collectLocalBackup())
    window.sessionStorage.setItem(SESSION_BOOTSTRAP_KEY, '1')
    return { ok: true, message: 'Backed up to Google Drive.' }
  } catch (e) {
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
