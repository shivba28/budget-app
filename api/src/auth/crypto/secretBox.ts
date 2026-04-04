import crypto from 'node:crypto'

function keyFromSecret(secret: string): Buffer {
  return crypto.createHash('sha256').update(secret, 'utf8').digest()
}

/** AES-256-GCM; returns base64url ciphertext. */
export function seal(plain: string, secret: string): string {
  const iv = crypto.randomBytes(12)
  const key = keyFromSecret(secret)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc]).toString('base64url')
}

export function open(sealed: string, secret: string): string {
  const buf = Buffer.from(sealed, 'base64url')
  const iv = buf.subarray(0, 12)
  const tag = buf.subarray(12, 28)
  const enc = buf.subarray(28)
  const key = keyFromSecret(secret)
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8')
}
