/**
 * Foreground sync — triggers a silent Teller sync whenever the app returns
 * to the foreground and the last sync is older than STALE_MS.
 *
 * Call startForegroundSync() once after the DB and auth are ready (in
 * RootLayout). Call stopForegroundSync() on unmount (cleanup only; in
 * practice the root layout lives for the app's lifetime).
 */

import { AppState, type AppStateStatus } from 'react-native'

import { META_LAST_TELLER_SYNC_AT } from '../db/constants'
import { useSyncStore } from '../stores/syncStore'

/** Sync if data is older than this threshold. */
const STALE_MS = 5 * 60 * 1000 // 5 minutes

function getLastSyncAt(): string | null {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { getMeta } = require('../db/queries/appMeta') as typeof import('../db/queries/appMeta')
  return getMeta(META_LAST_TELLER_SYNC_AT) ?? null
}

function isStale(): boolean {
  const last = getLastSyncAt()
  if (!last) return true
  return Date.now() - new Date(last).getTime() > STALE_MS
}

let _listener: ReturnType<typeof AppState.addEventListener> | null = null
let _syncing = false

async function runSilentSync(): Promise<void> {
  if (_syncing) return
  _syncing = true

  const { setSyncing, setSyncDone, setSyncError } = useSyncStore.getState()
  setSyncing()

  try {
    const { syncTellerAllAccounts } = await import('./teller/sync')
    await syncTellerAllAccounts()
    const lastAt = getLastSyncAt() ?? new Date().toISOString()
    setSyncDone(lastAt)
  } catch (err) {
    setSyncError(err instanceof Error ? err.message : 'Sync failed')
  } finally {
    _syncing = false
  }
}

export function startForegroundSync(): void {
  if (_listener) return

  let prevState: AppStateStatus = AppState.currentState

  _listener = AppState.addEventListener('change', (nextState) => {
    const comingToForeground = prevState !== 'active' && nextState === 'active'
    prevState = nextState
    if (comingToForeground && isStale()) {
      void runSilentSync()
    }
  })
}

export function stopForegroundSync(): void {
  _listener?.remove()
  _listener = null
}
