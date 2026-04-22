import 'react-native-gesture-handler'
import '../global.css'

import { BottomSheetModalProvider } from '@gorhom/bottom-sheet'
import { useEffect, useState } from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { Stack } from 'expo-router'

import { InactivityWatcher } from '@/src/auth/InactivityWatcher'
import { useAuthStore } from '@/src/auth/authStore'
import { ensureDbReady } from '@/src/db'
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
      await hydrateFromStorage()
      if (!cancelled) setDbReady(true)
    })()
    return () => {
      cancelled = true
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
        <AuthTouchRoot>
          <InactivityWatcher />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="onboarding" />
            <Stack.Screen name="setup-pin" />
            <Stack.Screen name="unlock" />
            <Stack.Screen name="app" />
          </Stack>
        </AuthTouchRoot>
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
