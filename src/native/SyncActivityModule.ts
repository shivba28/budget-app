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

function clamp01(n: number): number {
  if (Number.isNaN(n) || !Number.isFinite(n)) return 0
  return Math.max(0, Math.min(1, n))
}

function pct(progressUnits: number): string {
  if (totalUnits <= 0) return '0%'
  const p = clamp01(progressUnits / totalUnits)
  return `${Math.round(p * 100)}%`
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

    const state: LiveActivity.LiveActivityState = {
      title: 'Syncing Transactions',
      subtitle: '0%',
      // Use a small non-zero value so Swift optional binding doesn't treat it as nil
      progressBar: { progress: 0.01 },
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
    const state: LiveActivity.LiveActivityState = {
      title: 'Syncing Transactions',
      subtitle: pct(progressUnits),
      progressBar: { progress: p },
    }

    LiveActivity.updateActivity(activityId, state)
  },

  endSyncActivity() {
    if (Platform.OS !== 'ios') return
    if (!activityId) return

    const doneState: LiveActivity.LiveActivityState = {
      title: 'Sync complete',
      subtitle: '100%',
      progressBar: { progress: 1 },
    }

    // Update to 100% immediately so the Dynamic Island shows completion,
    // then stop after 1.5 s to give the animation time to render.
    const id = activityId
    activityId = undefined
    totalUnits = 0

    LiveActivity.updateActivity(id, doneState)
    setTimeout(() => {
      LiveActivity.stopActivity(id, doneState)
    }, 1500)
  },
}

export default SyncActivityModule
