import { useEffect } from 'react'
import { useRouter } from 'expo-router'

import { useAuthStore } from './authStore'

export function InactivityWatcher() {
  const router = useRouter()
  const hydrated = useAuthStore((s) => s.hydrated)
  const timeoutMs = useAuthStore((s) => s.inactivityTimeoutMs)
  const lockSession = useAuthStore((s) => s.lockSession)

  useEffect(() => {
    if (!hydrated) return
    const id = setInterval(() => {
      const { isUnlocked, lastActivityAt } = useAuthStore.getState()
      if (!isUnlocked) return
      if (Date.now() - lastActivityAt > timeoutMs) {
        lockSession()
        router.replace('/unlock')
      }
    }, 4000)
    return () => clearInterval(id)
  }, [hydrated, lockSession, router, timeoutMs])

  return null
}
