import { Platform } from 'react-native'

import * as LiveActivity from 'expo-live-activity'

/**
 * JS-facing bridge for the sync Live Activity.
 * Used by both foreground and background sync.
 *
 * Returns true from startSyncActivity when a Live Activity was successfully
 * started (i.e. the device has a Dynamic Island and ActivityKit is available).
 * Callers can use this to suppress the in-app fallback progress bar.
 */
let activityId: string | void
let totalUnits = 0
let lastUpdateAt = 0
const MIN_UPDATE_INTERVAL_MS = 500

function clamp01(n: number): number {
  if (Number.isNaN(n) || !Number.isFinite(n)) return 0
  return Math.max(0, Math.min(1, n))
}

function pct(progressUnits: number): string {
  if (totalUnits <= 0) return '0'
  const p = clamp01(progressUnits / totalUnits)
  return `${Math.round(p * 100)}`
}

const config: LiveActivity.LiveActivityConfig = {
  backgroundColor: '#111111',
  titleColor: '#FAFAF5',
  subtitleColor: '#FAFAF5',
  progressViewTint: '#F5C842',
  progressViewLabelColor: '#FAFAF5',
  padding: { horizontal: 16, top: 12, bottom: 12 },
}

const SyncActivityModule = {
  /**
   * Starts a Live Activity for a sync operation.
   * @returns true if the activity started (Dynamic Island available), false otherwise.
   */
  startSyncActivity(total: number): boolean {
    if (Platform.OS !== 'ios') return false
    totalUnits = Number.isFinite(total) ? total : 0

    // Start without a progress bar so the indicator doesn't show a misleading
    // "0%". The subtitle keeps the Dynamic Island sync icon visible. Progress
    // is only shown once updateSyncActivity is called with real data.
    const state: LiveActivity.LiveActivityState = {
      title: 'Syncing Transactions',
      subtitle: 'Syncing…',
    }

    activityId = LiveActivity.startActivity(state, config)
    const started = activityId != null
    console.warn(`[SyncActivity] startActivity → ${started ? `id=${activityId}` : 'NOT started (device may not support Live Activities)'}`)
    return started
  },

  updateSyncActivity(progressUnits: number) {
    if (Platform.OS !== 'ios') return
    if (!activityId) return

    const p = totalUnits > 0 ? clamp01(progressUnits / totalUnits) : 0
    const now = Date.now()

    // Respect ActivityKit's rate limit (~1 update/sec). Always push the final
    // 100% update so the bar reaches the end before the activity is stopped.
    if (p < 1 && now - lastUpdateAt < MIN_UPDATE_INTERVAL_MS) return

    const state: LiveActivity.LiveActivityState = {
      title: 'Syncing Transactions',
      subtitle: pct(progressUnits),
      progressBar: { progress: p },
    }

    try {
      LiveActivity.updateActivity(activityId, state)
      lastUpdateAt = now
    } catch {
      // Activity was already dismissed — clear our reference so subsequent
      // calls are no-ops.
      activityId = undefined
    }
  },

  endSyncActivity() {
    if (Platform.OS !== 'ios') return
    if (!activityId) return

    const id = activityId
    activityId = undefined
    totalUnits = 0
    lastUpdateAt = 0

    try {
      LiveActivity.stopActivity(id, {
        title: 'Sync complete',
        subtitle: '100',
        progressBar: { progress: 1 },
      })
    } catch {
      // Activity was already dismissed by the user or system — nothing to do.
    }
  },
}

export default SyncActivityModule
