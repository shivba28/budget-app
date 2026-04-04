import { useCallback, useEffect, useRef } from 'react'
import { refreshTransactionsFromBackend } from '@/lib/api'
import * as storage from '@/lib/storage'

/** Refetch when returning to the app if data is older than this. */
const STALE_MS = 15 * 60 * 1000

/** While the tab/PWA is visible, consider another pull at this interval (if stale). */
const VISIBLE_INTERVAL_MS = 30 * 60 * 1000

/**
 * When the app is unlocked: pull bank transactions if cache is stale, on foreground
 * and on a timer only while visible. Skips demo/unlinked accounts. Failures are silent
 * (keeps cached data); successful pulls update storage and dispatch
 * {@link storage.BANK_SYNC_COMPLETED_EVENT}.
 */
export function useBackgroundBankSync(enabled: boolean): void {
  const busyRef = useRef(false)

  const runIfStale = useCallback(async (): Promise<void> => {
    if (!enabled || typeof document === 'undefined') return
    if (document.visibilityState !== 'visible') return
    if (!storage.hasLinkedBankAccountsForSync()) return
    if (busyRef.current) return

    const last = storage.getLastBankSyncAt()
    if (last !== null && Date.now() - last < STALE_MS) return

    busyRef.current = true
    try {
      await refreshTransactionsFromBackend({ throwOnFailure: false })
    } finally {
      busyRef.current = false
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) return

    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') void runIfStale()
    }

    document.addEventListener('visibilitychange', onVisibility)
    /* Defer so Transactions `doInitialLoad` usually runs first and avoids a duplicate fetch. */
    const initialId = window.setTimeout(() => void runIfStale(), 2000)

    return () => {
      window.clearTimeout(initialId)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [enabled, runIfStale])

  useEffect(() => {
    if (!enabled) return

    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void runIfStale()
    }, VISIBLE_INTERVAL_MS)

    return () => window.clearInterval(id)
  }, [enabled, runIfStale])
}
