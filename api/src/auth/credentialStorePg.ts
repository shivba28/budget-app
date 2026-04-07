import { query } from '../db/pool.js'

export type StoredWebAuthnCredential = {
  credentialId: string
  /** base64url-encoded raw public key (COSE) */
  publicKey: string
  counter: number
  transports: string[]
  device: string
  name?: string
  createdAt: string
  lastUsedAt: string
}

export async function listCredentials(googleSub: string): Promise<StoredWebAuthnCredential[]> {
  const { rows } = await query<{
    credential_id: string
    public_key: string
    counter: number
    transports: string[]
    device: string
    name: string | null
    created_at: string
    last_used_at: string
  }>(
    `SELECT credential_id, public_key, counter, transports, device, name,
            created_at::text AS created_at, last_used_at::text AS last_used_at
     FROM webauthn_credentials
     WHERE user_id = $1
     ORDER BY last_used_at DESC, credential_id ASC`,
    [googleSub],
  )
  return rows.map((r) => ({
    credentialId: r.credential_id,
    publicKey: r.public_key,
    counter: typeof r.counter === 'number' ? r.counter : Number(r.counter ?? 0),
    transports: Array.isArray(r.transports) ? r.transports : [],
    device: r.device,
    ...(r.name ? { name: r.name } : {}),
    createdAt: r.created_at,
    lastUsedAt: r.last_used_at,
  }))
}

export async function hasAnyCredential(googleSub: string): Promise<boolean> {
  const { rows } = await query<{ n: string }>(
    `SELECT 1::text AS n FROM webauthn_credentials WHERE user_id = $1 LIMIT 1`,
    [googleSub],
  )
  return rows.length > 0
}

export async function findCredentialById(
  credentialId: string,
): Promise<{ googleSub: string; credential: StoredWebAuthnCredential } | null> {
  const { rows } = await query<{
    user_id: string
    credential_id: string
    public_key: string
    counter: number
    transports: string[]
    device: string
    name: string | null
    created_at: string
    last_used_at: string
  }>(
    `SELECT user_id, credential_id, public_key, counter, transports, device, name,
            created_at::text AS created_at, last_used_at::text AS last_used_at
     FROM webauthn_credentials
     WHERE credential_id = $1
     LIMIT 1`,
    [credentialId],
  )
  const r = rows[0]
  if (!r) return null
  return {
    googleSub: r.user_id,
    credential: {
      credentialId: r.credential_id,
      publicKey: r.public_key,
      counter: typeof r.counter === 'number' ? r.counter : Number(r.counter ?? 0),
      transports: Array.isArray(r.transports) ? r.transports : [],
      device: r.device,
      ...(r.name ? { name: r.name } : {}),
      createdAt: r.created_at,
      lastUsedAt: r.last_used_at,
    },
  }
}

export async function addCredential(
  googleSub: string,
  cred: Omit<StoredWebAuthnCredential, 'createdAt' | 'lastUsedAt'>,
): Promise<void> {
  const now = new Date().toISOString()
  try {
    await query(
      `INSERT INTO webauthn_credentials (
         user_id, credential_id, public_key, counter, transports, device, name, created_at, last_used_at
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        googleSub,
        cred.credentialId,
        cred.publicKey,
        cred.counter ?? 0,
        cred.transports ?? [],
        cred.device,
        cred.name ?? null,
        now,
        now,
      ],
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.toLowerCase().includes('duplicate') || msg.toLowerCase().includes('unique')) {
      throw new Error('Credential already registered')
    }
    throw e
  }
}

export async function updateCredentialAfterAuth(
  googleSub: string,
  credentialId: string,
  newCounter: number,
): Promise<void> {
  await query(
    `UPDATE webauthn_credentials
     SET counter = $3, last_used_at = NOW()
     WHERE user_id = $1 AND credential_id = $2`,
    [googleSub, credentialId, newCounter],
  )
}

export async function removeCredential(
  googleSub: string,
  credentialId: string,
): Promise<boolean> {
  const { rowCount } = await query(
    `DELETE FROM webauthn_credentials WHERE user_id = $1 AND credential_id = $2`,
    [googleSub, credentialId],
  )
  return rowCount > 0
}

export async function credentialSummary(googleSub: string): Promise<{
  hasPasskeys: boolean
  credentialCount: number
  lastUsedAt: string | null
}> {
  const { rows } = await query<{
    n: number
    last_used_at: string | null
  }>(
    `SELECT COUNT(*)::int AS n, MAX(last_used_at)::text AS last_used_at
     FROM webauthn_credentials
     WHERE user_id = $1`,
    [googleSub],
  )
  const r = rows[0]
  const n = r && typeof r.n === 'number' ? r.n : Number((r as any)?.n ?? 0)
  return {
    hasPasskeys: n > 0,
    credentialCount: n,
    lastUsedAt: r?.last_used_at ?? null,
  }
}

