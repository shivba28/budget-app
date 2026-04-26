import { create } from 'zustand'

export type SyncStatus = 'idle' | 'syncing' | 'done' | 'error'

interface SyncState {
  status: SyncStatus
  lastSyncAt: string | null
  error: string | null
  /** Called by foregroundSync when a silent sync starts. */
  setSyncing: () => void
  /** Called by foregroundSync when a silent sync succeeds. */
  setSyncDone: (lastSyncAt: string) => void
  /** Called by foregroundSync when a silent sync fails. */
  setSyncError: (msg: string) => void
}

export const useSyncStore = create<SyncState>((set) => ({
  status: 'idle',
  lastSyncAt: null,
  error: null,
  setSyncing: () => set({ status: 'syncing', error: null }),
  setSyncDone: (lastSyncAt: string) => set({ status: 'done', lastSyncAt, error: null }),
  setSyncError: (msg: string) => set({ status: 'error', error: msg }),
}))
