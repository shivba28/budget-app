import * as SecureStore from 'expo-secure-store'
import { create } from 'zustand'

import { getMetaSync, removeMetaSync, setMetaSync } from './appMeta'
import {
  DEFAULT_INACTIVITY_MS,
  LEGACY_GOOGLE_USER_KEY,
  META,
  SECURE,
} from './constants'

type AuthState = {
  hydrated: boolean
  hasPin: boolean
  onboardingComplete: boolean
  inactivityTimeoutMs: number
  isUnlocked: boolean
  lastActivityAt: number
  hydrateFromStorage: () => Promise<void>
  completeOnboardingPersisted: () => void
  setHasPinPersisted: (has: boolean) => void
  recordUnlockPersisted: () => void
  unlockSession: () => void
  lockSession: () => void
  touchActivity: () => void
  signOut: () => Promise<void>
  clearAllData: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  hydrated: false,
  hasPin: false,
  onboardingComplete: false,
  inactivityTimeoutMs: DEFAULT_INACTIVITY_MS,
  isUnlocked: false,
  lastActivityAt: Date.now(),

  hydrateFromStorage: async () => {
    removeMetaSync(LEGACY_GOOGLE_USER_KEY)

    const onboardingComplete = getMetaSync(META.ONBOARDING_COMPLETE) === '1'
    const timeoutRaw = getMetaSync(META.INACTIVITY_TIMEOUT_MS)
    const pinHash = await SecureStore.getItemAsync(SECURE.PIN_HASH)
    const hasPin = Boolean(pinHash && pinHash.length > 0)
    const parsedTimeout = timeoutRaw ? Number.parseInt(timeoutRaw, 10) : Number.NaN
    const inactivityTimeoutMs =
      Number.isFinite(parsedTimeout) && parsedTimeout > 0
        ? parsedTimeout
        : DEFAULT_INACTIVITY_MS

    set({
      hydrated: true,
      hasPin,
      onboardingComplete,
      inactivityTimeoutMs,
      isUnlocked: false,
      lastActivityAt: Date.now(),
    })
  },

  completeOnboardingPersisted: () => {
    setMetaSync(META.ONBOARDING_COMPLETE, '1')
    set({ onboardingComplete: true })
  },

  setHasPinPersisted: (has) => {
    set({ hasPin: has })
  },

  recordUnlockPersisted: () => {
    setMetaSync(META.LAST_UNLOCK_AT, new Date().toISOString())
  },

  unlockSession: () => {
    set({ isUnlocked: true, lastActivityAt: Date.now() })
  },

  lockSession: () => {
    set({ isUnlocked: false })
  },

  touchActivity: () => {
    if (get().isUnlocked) set({ lastActivityAt: Date.now() })
  },

  signOut: async () => {
    await SecureStore.deleteItemAsync(SECURE.PIN_HASH).catch(() => {})
    removeMetaSync(LEGACY_GOOGLE_USER_KEY)
    set({
      hasPin: false,
      isUnlocked: false,
      lastActivityAt: Date.now(),
    })
  },

  clearAllData: async () => {
    // Unregister background sync task before wiping data
    const { unregisterBackgroundSync } = await import('../lib/backgroundSync')
    await unregisterBackgroundSync().catch(() => {})

    // Wipe all SecureStore keys
    await SecureStore.deleteItemAsync(SECURE.PIN_HASH).catch(() => {})

    // Wipe all SQLite tables (import lazily to avoid circular deps)
    const { sqlite } = await import('../db/client')
    sqlite.execute('DELETE FROM transactions')
    sqlite.execute('DELETE FROM accounts')
    sqlite.execute('DELETE FROM teller_enrollments')
    sqlite.execute('DELETE FROM categories')
    sqlite.execute('DELETE FROM trips')
    sqlite.execute('DELETE FROM budgets')
    sqlite.execute('DELETE FROM app_meta')

    set({
      hydrated: true,
      hasPin: false,
      onboardingComplete: false,
      isUnlocked: false,
      lastActivityAt: Date.now(),
    })
  },
}))
