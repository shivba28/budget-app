import type { ReactElement } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { filterTransactionsByVisibleAccounts } from '@/lib/api'
import {
  checkBudgetAlert,
  getNotificationsEnabled,
  hasShownAlertThisMonth,
  markAlertShownThisMonth,
  sendBudgetBrowserNotification,
} from '@/lib/budget'
import * as storage from '@/lib/storage'
import { useAuth } from '@/contexts/AuthContext'
import { BudgetAlert } from '@/components/BudgetAlert'

/**
 * Runs the 80% budget check after transactions are available; shows in-app toast and optional
 * browser notification once per calendar month.
 */
export function BudgetAlertHost(): ReactElement | null {
  const { status } = useAuth()
  const [visible, setVisible] = useState(false)
  const [payload, setPayload] = useState<{
    percentage: number
    spent: number
    budget: number
  } | null>(null)
  const [rev, setRev] = useState(0)

  useEffect(() => {
    const bump = (): void => setRev((n) => n + 1)
    window.addEventListener(storage.BANK_SYNC_COMPLETED_EVENT, bump)
    window.addEventListener(storage.MONTHLY_BUDGETS_CHANGED_EVENT, bump)
    window.addEventListener(storage.ACCOUNTS_EXCLUSIONS_CHANGED_EVENT, bump)
    window.addEventListener(storage.BUDGET_ALERT_ACK_RESET_EVENT, bump)
    return () => {
      window.removeEventListener(storage.BANK_SYNC_COMPLETED_EVENT, bump)
      window.removeEventListener(storage.MONTHLY_BUDGETS_CHANGED_EVENT, bump)
      window.removeEventListener(storage.ACCOUNTS_EXCLUSIONS_CHANGED_EVENT, bump)
      window.removeEventListener(storage.BUDGET_ALERT_ACK_RESET_EVENT, bump)
    }
  }, [])

  useEffect(() => {
    if (status !== 'ready') return

    const raw = storage.getTransactions()
    if (raw === null) return

    const filtered = filterTransactionsByVisibleAccounts(raw)
    const result = checkBudgetAlert(filtered)
    if (result === null || !result.shouldAlert) return
    if (hasShownAlertThisMonth()) return

    /* Mark immediately so React StrictMode / duplicate effects don’t double-fire the toast. */
    markAlertShownThisMonth()

    if (getNotificationsEnabled()) {
      sendBudgetBrowserNotification(
        result.percentage,
        result.spent,
        result.budget,
      )
    }

    queueMicrotask(() => {
      setPayload({
        percentage: result.percentage,
        spent: result.spent,
        budget: result.budget,
      })
      setVisible(true)
    })
  }, [status, rev])

  const onDismiss = useCallback(() => {
    setVisible(false)
  }, [])

  if (status !== 'ready') {
    return null
  }

  return (
    <AnimatePresence onExitComplete={() => setPayload(null)}>
      {status === 'ready' && visible && payload ? (
        <BudgetAlert
          key="budget-alert"
          percentage={payload.percentage}
          spent={payload.spent}
          budget={payload.budget}
          onDismiss={onDismiss}
        />
      ) : null}
    </AnimatePresence>
  )
}
