import { Stack } from 'expo-router'

export default function TripsStackLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[tripId]" />
    </Stack>
  )
}
