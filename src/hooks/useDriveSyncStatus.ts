import { useEffect, useState } from 'react'
import {
  DRIVE_SYNC_STATUS_EVENT,
  getDriveSyncStatusSnapshot,
  type DriveSyncStatusSnapshot,
} from '@/lib/cloudBackup/driveSyncStatus'

export function useDriveSyncStatus(): DriveSyncStatusSnapshot {
  const [snapshot, setSnapshot] = useState(() => getDriveSyncStatusSnapshot())
  useEffect(() => {
    const refresh = () => setSnapshot(getDriveSyncStatusSnapshot())
    refresh()
    window.addEventListener(DRIVE_SYNC_STATUS_EVENT, refresh)
    window.addEventListener('storage', refresh)
    const id = window.setInterval(refresh, 60_000)
    return () => {
      window.removeEventListener(DRIVE_SYNC_STATUS_EVENT, refresh)
      window.removeEventListener('storage', refresh)
      window.clearInterval(id)
    }
  }, [])
  return snapshot
}
