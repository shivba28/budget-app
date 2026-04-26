import { Redirect, Stack } from 'expo-router'

import { useAuthStore } from '@/src/auth/authStore'

export default function AppStackLayout() {
  const hydrated = useAuthStore((s) => s.hydrated)
  const isUnlocked = useAuthStore((s) => s.isUnlocked)

  if (!hydrated) return null
  if (!isUnlocked) return <Redirect href="/unlock" />

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="categories" />
      <Stack.Screen name="budgets" />
      <Stack.Screen name="alerts" />
      <Stack.Screen name="manual-accounts" />
      <Stack.Screen name="bank-accounts" />
      <Stack.Screen name="transaction-new" />
      <Stack.Screen name="trip-new" />
      <Stack.Screen name="transaction-edit/[id]" />
      <Stack.Screen name="trip/[tripId]" />
      <Stack.Screen name="csv-import" />
    </Stack>
  )
}
