/** Result of Teller Connect onSuccess (sensitive: accessToken). */
export interface TellerEnrollment {
  accessToken: string
  userId: string
  enrollmentId: string
  institutionName: string
}

/** SQLite-backed metadata only — never includes accessToken. */
export interface EnrollmentMeta {
  enrollmentId: string
  institutionName: string
  userId: string
  status: 'connected' | 'disconnected' | 'unknown'
  lastSyncAt: string | null
  lastError: string | null
}
