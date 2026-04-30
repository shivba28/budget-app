import { create } from 'zustand'

export type SyncStatus = 'idle' | 'syncing' | 'done' | 'error'

interface SyncState {
  status: SyncStatus
  lastSyncAt: string | null
  error: string | null
  /**
   * True while a Live Activity is running in the Dynamic Island.
   * When true, the SyncProgressBar hides itself on iOS so the two
   * indicators don't overlap.
   */
  liveActivityActive: boolean
  /** Called by foregroundSync when a silent sync starts. */
  setSyncing: () => void
  /** Called by foregroundSync when a silent sync succeeds. */
  setSyncDone: (lastSyncAt: string) => void
  /** Called by foregroundSync when a silent sync fails. */
  setSyncError: (msg: string) => void
  setLiveActivityActive: (active: boolean) => void
}

export const useSyncStore = create<SyncState>((set) => ({
  status: 'idle',
  lastSyncAt: null,
  error: null,
  liveActivityActive: false,
  setSyncing: () => set({ status: 'syncing', error: null }),
  setSyncDone: (lastSyncAt: string) => set({ status: 'done', lastSyncAt, error: null }),
  setSyncError: (msg: string) => set({ status: 'error', error: msg }),
  setLiveActivityActive: (active: boolean) => set({ liveActivityActive: active }),
}))
