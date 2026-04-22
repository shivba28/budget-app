import { create } from 'zustand'

import * as tellerEq from '@/src/db/queries/tellerEnrollments'
import type { EnrollmentMeta } from '@/src/lib/teller/enrollmentTypes'

type State = {
  items: EnrollmentMeta[]
  refresh: () => void
}

function mapRows(): EnrollmentMeta[] {
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

export const useTellerEnrollmentsStore = create<State>((set) => ({
  items: mapRows(),
  refresh: () => set({ items: mapRows() }),
}))
