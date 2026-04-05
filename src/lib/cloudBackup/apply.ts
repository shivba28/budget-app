import type { CloudBackupPayload } from './types'
import { isAllowedBackupKey } from './keys'
import { setStoredCloudBackupEnvelopeAt } from './envelopeAt'

export async function applyCloudBackupPayload(data: CloudBackupPayload): Promise<void> {
  if (typeof window === 'undefined' || !window.localStorage) return
  const store = window.localStorage
  for (const [k, v] of Object.entries(data.localStorage)) {
    if (!isAllowedBackupKey(k)) continue
    try {
      store.setItem(k, v)
    } catch {
      // quota
    }
  }
  setStoredCloudBackupEnvelopeAt(data.updatedAt)
}
