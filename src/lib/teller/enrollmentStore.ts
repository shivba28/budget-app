import * as SecureStore from 'expo-secure-store'

import * as accountsQ from '@/src/db/queries/accounts'
import * as tellerEq from '@/src/db/queries/tellerEnrollments'
import * as txq from '@/src/db/queries/transactions'
import type { EnrollmentMeta, TellerEnrollment } from '@/src/lib/teller/enrollmentTypes'
import { useTellerEnrollmentsStore } from '@/src/stores/tellerEnrollmentsStore'

export type { EnrollmentMeta, TellerEnrollment } from '@/src/lib/teller/enrollmentTypes'

const secureKey = (enrollmentId: string) => `teller_token_${enrollmentId}`

export async function saveEnrollment(enrollment: TellerEnrollment): Promise<void> {
  const token = enrollment.accessToken
  await SecureStore.setItemAsync(secureKey(enrollment.enrollmentId), token, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED,
  })
  tellerEq.upsertTellerEnrollment({
    enrollment_id: enrollment.enrollmentId,
    institution_name: enrollment.institutionName?.trim() || null,
    user_id: enrollment.userId?.trim() || null,
    status: 'connected',
    last_sync_at: null,
    last_error: null,
  })
  useTellerEnrollmentsStore.getState().refresh()
}

export async function loadEnrollments(): Promise<EnrollmentMeta[]> {
  return tellerEq.listTellerEnrollments().map((row) => ({
    enrollmentId: row.enrollment_id,
    institutionName: row.institution_name?.trim() || 'Unknown',
    userId: row.user_id?.trim() || '',
    status:
      row.status === 'connected' || row.status === 'disconnected'
        ? row.status
        : 'unknown',
    lastSyncAt: row.last_sync_at ?? null,
    lastError: row.last_error ?? null,
  }))
}

export async function getAccessToken(enrollmentId: string): Promise<string | null> {
  return SecureStore.getItemAsync(secureKey(enrollmentId))
}

export async function deleteEnrollment(enrollmentId: string): Promise<void> {
  const accs = accountsQ
    .listBankLinkedAccounts()
    .filter((a) => a.enrollment_id === enrollmentId)
  for (const a of accs) {
    txq.deleteTransactionsForAccount(a.id)
    accountsQ.deleteAccount(a.id)
  }
  tellerEq.deleteTellerEnrollment(enrollmentId)
  try {
    await SecureStore.deleteItemAsync(secureKey(enrollmentId))
  } catch {
    /* key may already be absent */
  }
  useTellerEnrollmentsStore.getState().refresh()
}
