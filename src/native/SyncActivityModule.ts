import { Platform } from 'react-native'

import * as LiveActivity from 'expo-live-activity'

/**
 * JS-facing bridge that matches the requested native module shape.
 *
 * Under the hood this uses `expo-live-activity`, which manages the iOS target
 * and ActivityConfiguration via its config plugin.
 */
let activityId: string | undefined
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
  startSyncActivity(total: number) {
    if (Platform.OS !== 'ios') return
    totalUnits = Number.isFinite(total) ? total : 0
    const progress = 0

    const state: LiveActivity.LiveActivityState = {
      title: 'Syncing Transactions...',
      subtitle: pct(progress),
      progressBar: { progress: 0 },
      // If you add an image named `sync` under `assets/liveActivity/`,
      // the Dynamic Island can show it in the compact leading slot.
      // imageName: 'sync',
      // dynamicIslandImageName: 'sync',
    }

    activityId = LiveActivity.startActivity(state, config, 1.0)
  },

  updateSyncActivity(progressUnits: number) {
    if (Platform.OS !== 'ios') return
    if (!activityId) return

    const p = totalUnits > 0 ? clamp01(progressUnits / totalUnits) : 0
    const state: LiveActivity.LiveActivityState = {
      title: 'Syncing Transactions...',
      subtitle: pct(progressUnits),
      progressBar: { progress: p },
      // imageName: 'sync',
      // dynamicIslandImageName: 'sync',
    }

    LiveActivity.updateActivity(activityId, state, 1.0)
  },

  endSyncActivity() {
    if (Platform.OS !== 'ios') return
    if (!activityId) return

    const state: LiveActivity.LiveActivityState = {
      title: 'Sync complete',
      subtitle: '100%',
      progressBar: { progress: 1 },
      // imageName: 'sync',
      // dynamicIslandImageName: 'sync',
    }

    LiveActivity.stopActivity(activityId, state, 1.0)
    activityId = undefined
    totalUnits = 0
  },
}

export default SyncActivityModule

