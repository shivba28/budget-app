import type { Href } from 'expo-router'

import { useAuthStore } from './authStore'

/** First route after cold start (post-hydrate): onboarding → PIN → unlock → app. */
export function useAuthGateHref(): Href | null {
  const hydrated = useAuthStore((s) => s.hydrated)
  const onboardingComplete = useAuthStore((s) => s.onboardingComplete)
  const hasPin = useAuthStore((s) => s.hasPin)
  const isUnlocked = useAuthStore((s) => s.isUnlocked)

  if (!hydrated) return null
  if (!onboardingComplete) return '/onboarding'
  if (!hasPin) return '/setup-pin'
  if (!isUnlocked) return '/unlock'
  return '/app'
}
