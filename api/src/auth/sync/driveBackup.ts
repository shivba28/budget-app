import { OAuth2Client } from 'google-auth-library'
import { google } from 'googleapis'
import { config } from '../config/env.js'
import { getRefreshToken, getSession, setDriveFileId } from '../sessionStoreFile.js'

const BACKUP_NAME = 'budget-app-backup.json'

async function driveForSession(sessionId: string) {
  const refresh = await getRefreshToken(sessionId)
  if (!refresh) return null
  const oauth2 = new OAuth2Client(
    config.googleClientId,
    config.googleClientSecret,
    config.googleRedirectUri,
  )
  oauth2.setCredentials({ refresh_token: refresh })
  return google.drive({ version: 'v3', auth: oauth2 })
}

async function validateCachedId(
  drive: ReturnType<typeof google.drive>,
  cached?: string,
): Promise<string | null> {
  if (!cached) return null
  try {
    await drive.files.get({ fileId: cached, fields: 'id' })
    return cached
  } catch {
    return null
  }
}

async function findExistingBackupFileId(
  drive: ReturnType<typeof google.drive>,
): Promise<string | null> {
  const list = await drive.files.list({
    spaces: 'appDataFolder',
    q: `name = '${BACKUP_NAME.replace(/'/g, "\\'")}' and trashed = false`,
    fields: 'files(id)',
    pageSize: 10,
  })
  return list.data.files?.[0]?.id ?? null
}

async function ensureBackupFileId(
  drive: ReturnType<typeof google.drive>,
  cached?: string,
): Promise<string> {
  const validated = await validateCachedId(drive, cached)
  if (validated) return validated
  const existing = await findExistingBackupFileId(drive)
  if (existing) return existing
  const created = await drive.files.create({
    requestBody: {
      name: BACKUP_NAME,
      parents: ['appDataFolder'],
      mimeType: 'application/json',
    },
    media: {
      mimeType: 'application/json',
      body: '{"schemaVersion":1,"updatedAt":"","localStorage":{}}',
    },
    fields: 'id',
  })
  const newId = created.data.id
  if (!newId) throw new Error('Drive create did not return file id')
  return newId
}

export async function readBackupFromDrive(sessionId: string): Promise<string> {
  const drive = await driveForSession(sessionId)
  if (!drive) throw new Error('Invalid session')
  const rec = getSession(sessionId)
  if (!rec) throw new Error('Invalid session')
  const validated = await validateCachedId(drive, rec.driveFileId)
  const fileId = validated ?? (await findExistingBackupFileId(drive))
  if (!fileId) {
    const err = new Error('Backup not found')
    ;(err as { code?: string }).code = 'BACKUP_NOT_FOUND'
    throw err
  }
  if (fileId !== rec.driveFileId) await setDriveFileId(sessionId, fileId)
  const res = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'text' },
  )
  const data = res.data as string
  if (typeof data !== 'string') {
    throw new Error('Unexpected Drive response')
  }
  return data
}

export async function writeBackupToDrive(
  sessionId: string,
  jsonBody: string,
): Promise<void> {
  const drive = await driveForSession(sessionId)
  if (!drive) throw new Error('Invalid session')
  const rec = getSession(sessionId)
  if (!rec) throw new Error('Invalid session')
  const fileId = await ensureBackupFileId(drive, rec.driveFileId)
  if (fileId !== rec.driveFileId) await setDriveFileId(sessionId, fileId)
  await drive.files.update({
    fileId,
    media: {
      mimeType: 'application/json',
      body: jsonBody,
    },
  })
}
