import type { Express, Request, Response } from 'express'
import { bearerToken } from '../../auth/bearer.js'
import { hasAnyCredential } from '../../auth/credentialStoreFile.js'
import {
  getSession,
  isPinUnlocked,
  touchSessionExpiry,
} from '../../auth/sessionStoreFile.js'
import { getUserPinHash } from '../../auth/userPinStore.js'
import { readBackupFromDrive, writeBackupToDrive } from '../../auth/sync/driveBackup.js'

async function requireUnlockedSession(
  req: Request,
  res: Response,
): Promise<string | null> {
  const sid = bearerToken(req)
  if (!sid) {
    res.status(401).json({ error: 'Unauthorized' })
    return null
  }
  const rec = getSession(sid)
  if (!rec) {
    res.status(401).json({ error: 'Unauthorized' })
    return null
  }
  touchSessionExpiry(sid)
  const pinHash = getUserPinHash(rec.googleSub)
  const hasWebAuthn = hasAnyCredential(rec.googleSub)
  if (!pinHash && !hasWebAuthn) {
    res.status(403).json({ error: 'Configure a PIN or passkey in Settings' })
    return null
  }
  if (!isPinUnlocked(rec)) {
    res.status(403).json({ error: 'Unlock required' })
    return null
  }
  return sid
}

export function applySyncRoutes(app: Express): void {
  app.get('/api/sync/backup', async (req: Request, res: Response) => {
    const sid = await requireUnlockedSession(req, res)
    if (!sid) return
    try {
      const raw = await readBackupFromDrive(sid)
      res.type('application/json').send(raw)
    } catch (e) {
      if (e instanceof Error && (e as { code?: string }).code === 'BACKUP_NOT_FOUND') {
        res.status(404).json({ error: 'Backup not found' })
        return
      }
      const msg = e instanceof Error ? e.message : 'Drive read failed'
      res.status(500).json({ error: msg })
    }
  })

  app.put('/api/sync/backup', async (req: Request, res: Response) => {
    const sid = await requireUnlockedSession(req, res)
    if (!sid) return
    try {
      await writeBackupToDrive(sid, JSON.stringify(req.body))
      res.status(204).send()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Drive write failed'
      res.status(500).json({ error: msg })
    }
  })
}
