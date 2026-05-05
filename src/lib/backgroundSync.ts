/**
 * Nightly background sync using expo-background-task (BGTaskScheduler on iOS,
 * WorkManager on Android). Syncs Teller transactions once every ~24 hours.
 *
 * IMPORTANT: TaskManager.defineTask() MUST run at module evaluation time, before
 * any navigator mounts. This file is imported at the top of app/_layout.tsx.
 *
 * iOS notes:
 *  - Uses BGProcessingTask, NOT BGAppRefreshTask. Because of this the app does
 *    NOT appear in Settings → Background App Refresh — that list only covers the
 *    old UIBackgroundFetch / BGAppRefreshTask APIs. BGProcessingTask runs in a
 *    separate background-processing window, typically overnight while charging.
 *  - The system controls exact timing; minimumInterval is a lower bound.
 *  - Requires UIBackgroundModes: [processing] and BGTaskSchedulerPermittedIdentifiers
 *    in Info.plist (added below and by the expo-background-task config plugin).
 *
 * Android: WorkManager handles scheduling, respecting the interval fairly reliably.
 */

import * as Notifications from 'expo-notifications'

import { META_LAST_BG_SYNC_AT, META_LAST_BG_SYNC_NEW_COUNT } from '../db/constants'
import SyncActivityModule from '../native/SyncActivityModule'

export const BACKGROUND_SYNC_TASK = 'brutal-budget-nightly-sync'

/** 24 hours in minutes (expo-background-task interval unit). */
const INTERVAL_MINUTES = 24 * 60

// ─── Load native modules defensively ─────────────────────────────────────────
// Use require() so a missing native binary degrades gracefully rather than
// crashing the app on module evaluation.

type BgTask = typeof import('expo-background-task')
type TkMgr = typeof import('expo-task-manager')

function loadNative(): { BackgroundTask: BgTask; TaskManager: TkMgr } | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const BackgroundTask = require('expo-background-task') as BgTask
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const TaskManager = require('expo-task-manager') as TkMgr
    return { BackgroundTask, TaskManager }
  } catch {
    return null
  }
}

const native = loadNative()

// ─── Task definition (top-level, guarded) ────────────────────────────────────

if (native) {
  const { BackgroundTask, TaskManager } = native

  TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
    try {
      const { ensureDbReady } = await import('../db')
      await ensureDbReady()

      const { listTellerEnrollments } = await import('../db/queries/tellerEnrollments')
      const { listBankLinkedAccounts } = await import('../db/queries/accounts')
      const { ensureRecurringTransactionsSeeded } = await import('./transactions/recurringAutoAdd')
      const { listTransactions } = await import('../db/queries/transactions')
      const { setMeta } = await import('../db/queries/appMeta')
      const { syncTellerAllAccounts } = await import('./teller/sync')

      // 1 unit per enrollment + 2 per account (transactions + balance) + 1 for recurring seed
      const enrollmentCount = listTellerEnrollments().length
      const accountCount = listBankLinkedAccounts().length
      const total = enrollmentCount + accountCount * 2 + 1

      SyncActivityModule.startSyncActivity(total || 1)
      let done = 0

      const countBefore = listTransactions().length
      await syncTellerAllAccounts(() => {
        SyncActivityModule.updateSyncActivity(++done)
      })
      const countAfter = listTransactions().length
      const newCount = Math.max(0, countAfter - countBefore)

      setMeta(META_LAST_BG_SYNC_AT, new Date().toISOString())
      setMeta(META_LAST_BG_SYNC_NEW_COUNT, String(newCount))

      ensureRecurringTransactionsSeeded()
      SyncActivityModule.updateSyncActivity(++done)

      await sendSyncNotification(newCount)
      SyncActivityModule.endSyncActivity()

      return BackgroundTask.BackgroundTaskResult.Success
    } catch {
      SyncActivityModule.endSyncActivity()
      return BackgroundTask.BackgroundTaskResult.Failed
    }
  })
}

// ─── Notification helper ──────────────────────────────────────────────────────

async function sendSyncNotification(newCount: number): Promise<void> {
  try {
    const perms = await Notifications.getPermissionsAsync()
    const granted =
      (perms as unknown as { granted?: boolean }).granted === true ||
      (perms as unknown as { status?: string }).status === 'granted'
    if (!granted) return

    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Brutal Budget synced',
        body:
          newCount > 0
            ? `${newCount} new transaction${newCount === 1 ? '' : 's'} imported.`
            : 'Accounts are up to date — no new transactions.',
        data: { type: 'background_sync' },
      },
      trigger: null,
    })
  } catch {
    /* notification failure must not fail the background task */
  }
}

// ─── Registration ─────────────────────────────────────────────────────────────

export async function registerBackgroundSync(): Promise<void> {
  if (!native) return
  const { BackgroundTask, TaskManager } = native
  try {
    const status = await BackgroundTask.getStatusAsync()
    if (status === BackgroundTask.BackgroundTaskStatus.Restricted) return

    // Re-register is safe — the module handles idempotency internally.
    const tasks = await TaskManager.getRegisteredTasksAsync()
    const already = tasks.some((t) => t.taskName === BACKGROUND_SYNC_TASK)
    if (!already) {
      await BackgroundTask.registerTaskAsync(BACKGROUND_SYNC_TASK, {
        minimumInterval: INTERVAL_MINUTES,
      })
    }
  } catch {
    /* unavailable in Expo Go or simulators */
  }
}

export async function unregisterBackgroundSync(): Promise<void> {
  if (!native) return
  const { BackgroundTask, TaskManager } = native
  try {
    const registered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK)
    if (registered) await BackgroundTask.unregisterTaskAsync(BACKGROUND_SYNC_TASK)
  } catch {
    /* ignore */
  }
}

export function getLastBackgroundSyncInfo(): { lastAt: string | null; newCount: number } {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { getMeta } = require('../db/queries/appMeta') as typeof import('../db/queries/appMeta')
  return {
    lastAt: getMeta(META_LAST_BG_SYNC_AT) ?? null,
    newCount: Number(getMeta(META_LAST_BG_SYNC_NEW_COUNT) ?? '0'),
  }
}
