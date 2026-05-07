import 'react-native-gesture-handler'
import '../global.css'
// Task definition must be imported before any navigator mounts.
import '@/src/lib/backgroundSync'

import { BottomSheetModalProvider } from '@gorhom/bottom-sheet'
import { useEffect, useState } from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { Stack } from 'expo-router'

import { InactivityWatcher } from '@/src/auth/InactivityWatcher'
import { PrivacyOverlay } from '@/src/components/PrivacyOverlay'
import { useAuthStore } from '@/src/auth/authStore'
import { ensureDbReady } from '@/src/db'
import { ErrorBoundary } from '@/src/components/ErrorBoundary'
import { OfflineBanner } from '@/src/components/OfflineBanner'
import { SyncProgressBar } from '@/src/components/SyncProgressBar'
import { registerBackgroundSync } from '@/src/lib/backgroundSync'
import { startForegroundSync, stopForegroundSync } from '@/src/lib/foregroundSync'
import { ensureNotificationPermissionsOnce } from '@/src/lib/notifications'
import { ensureTellerMtlsConfigured } from '@/src/lib/teller/mtls'
import { ensureRecurringTransactionsSeeded } from '@/src/lib/transactions/recurringAutoAdd'
import { tokens } from '@/src/theme/tokens'

function AuthTouchRoot({ children }: { children: React.ReactNode }) {
  const touchActivity = useAuthStore((s) => s.touchActivity)
  return (
    <View style={styles.flex} onTouchStart={() => touchActivity()}>
      {children}
    </View>
  )
}

export default function RootLayout() {
  const hydrateFromStorage = useAuthStore((s) => s.hydrateFromStorage)
  const hydrated = useAuthStore((s) => s.hydrated)
  const [dbReady, setDbReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      await ensureDbReady()
      // Generate any due manual recurring transactions (local-only).
      ensureRecurringTransactionsSeeded()
      await hydrateFromStorage()
      // Request local notification permission once on first run.
      // (Budget alerts are local-only; no remote push infra.)
      await ensureNotificationPermissionsOnce().catch(() => {})
      // Configure Teller mTLS (dev/prod); safe no-op in sandbox.
      await ensureTellerMtlsConfigured().catch(() => {})
      // Register nightly background sync (no-op if already registered).
      await registerBackgroundSync().catch(() => {})
      if (!cancelled) {
        setDbReady(true)
        // Start listening for app foreground events to trigger stale-data syncs.
        startForegroundSync()
      }
    })()
    return () => {
      cancelled = true
      stopForegroundSync()
    }
  }, [hydrateFromStorage])

  if (!dbReady || !hydrated) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator color={tokens.color.fg} size="large" />
      </View>
    )
  }

  return (
    <GestureHandlerRootView style={styles.flex}>
      <BottomSheetModalProvider>
        <ErrorBoundary fallbackLabel="App error — tap to retry">
          <AuthTouchRoot>
            <InactivityWatcher />
            <PrivacyOverlay />
            <SyncProgressBar />
            <OfflineBanner />
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="onboarding" />
              <Stack.Screen name="setup-pin" />
              <Stack.Screen name="unlock" />
              <Stack.Screen name="app" />
            </Stack>
          </AuthTouchRoot>
        </ErrorBoundary>
      </BottomSheetModalProvider>
    </GestureHandlerRootView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.color.bg,
  },
})
