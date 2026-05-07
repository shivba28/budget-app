/**
 * Foreground sync — triggers a silent Teller sync whenever the app returns
 * to the foreground and the last sync is older than STALE_MS.
 *
 * Call startForegroundSync() once after the DB and auth are ready (in
 * RootLayout). Call stopForegroundSync() on unmount.
 *
 * triggerManualSync() can be called directly from pull-to-refresh or
 * manual sync buttons — it runs the same path so the Live Activity / Dynamic
 * Island fires for those syncs too.
 */

import { AppState, type AppStateStatus } from 'react-native'

import { META_LAST_TELLER_SYNC_AT } from '../db/constants'
import * as accountsQ from '../db/queries/accounts'
import * as tellerEq from '../db/queries/tellerEnrollments'
import SyncActivityModule from '../native/SyncActivityModule'
import { useSyncStore } from '../stores/syncStore'

/** Sync if data is older than this threshold. */
const STALE_MS = 5 * 60 * 1000 // 5 minutes

/**
 * Minimum time the Live Activity stays visible regardless of how fast the sync
 * finishes. Keeps the Dynamic Island on screen long enough for the user to see it.
 */
const MIN_LIVE_ACTIVITY_MS = 1_500

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

export async function triggerManualSync(): Promise<void> {
  if (_syncing) return
  _syncing = true

  const { setSyncing, setSyncDone, setSyncError, setLiveActivityActive } =
    useSyncStore.getState()

  setSyncing()

  // Compute real total before starting so the progress bar is accurate:
  // 1 unit per enrollment (account discovery) + 2 units per bank account (transactions + balance)
  const enrollmentCount = tellerEq.listTellerEnrollments().length
  const accountCount = accountsQ.listBankLinkedAccounts().length
  const total = enrollmentCount + accountCount * 2

  const liveActivityStarted = SyncActivityModule.startSyncActivity(total || 1)
  setLiveActivityActive(liveActivityStarted)

  const syncStartAt = Date.now()

  let done = 0
  try {
    const { syncTellerAllAccounts } = await import('./teller/sync')
    await syncTellerAllAccounts(() => {
      SyncActivityModule.updateSyncActivity(++done)
    })
    const lastAt = getLastSyncAt() ?? new Date().toISOString()
    // Keep the Live Activity visible for at least MIN_LIVE_ACTIVITY_MS so the
    // Dynamic Island has time to animate in even when syncs complete quickly.
    const elapsed = Date.now() - syncStartAt
    if (elapsed < MIN_LIVE_ACTIVITY_MS) {
      await new Promise<void>((r) => setTimeout(r, MIN_LIVE_ACTIVITY_MS - elapsed))
    }
    SyncActivityModule.endSyncActivity()
    setLiveActivityActive(false)
    setSyncDone(lastAt)
  } catch (err) {
    SyncActivityModule.endSyncActivity()
    setLiveActivityActive(false)
    setSyncError(err instanceof Error ? err.message : 'Sync failed')
  } finally {
    _syncing = false
  }
}

/**
 * Pull-to-refresh entry point.
 *
 * If a sync is already running (e.g. startup auto-sync), its Live Activity is
 * already on screen — we wait for it to finish and return, avoiding a redundant
 * second sync that would complete too fast for the Dynamic Island to be seen.
 *
 * If no sync is running, we trigger one normally (with the MIN_LIVE_ACTIVITY_MS
 * hold so it's always visible long enough).
 */
export async function triggerManualSyncNow(): Promise<void> {
  if (_syncing) {
    // A Live Activity is already showing for the in-progress sync. Just wait
    // for it to complete — the user will see that activity.
    await new Promise<void>((resolve) => {
      const deadline = Date.now() + 15_000
      const check = () => {
        if (!_syncing || Date.now() >= deadline) return resolve()
        setTimeout(check, 200)
      }
      check()
    })
    return
  }
  await triggerManualSync()
}

export function startForegroundSync(): void {
  if (_listener) return

  // Sync immediately on startup if data is stale — this is the most
  // reliable way to trigger the Live Activity on fresh app open.
  if (isStale()) {
    void triggerManualSync()
  }

  let prevState: AppStateStatus = AppState.currentState

  _listener = AppState.addEventListener('change', (nextState) => {
    const comingToForeground = prevState !== 'active' && nextState === 'active'
    prevState = nextState
    if (comingToForeground && isStale()) {
      void triggerManualSync()
    }
  })
}

export function stopForegroundSync(): void {
  _listener?.remove()
  _listener = null
}
