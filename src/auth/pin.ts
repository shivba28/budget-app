import { compare, genSalt, hash } from 'bcryptjs'

const SALT_ROUNDS = 10

function normalizePin(pin: string): string {
  return String(pin)
}

export async function hashPin(pin: string): Promise<string> {
  const p = normalizePin(pin)
  const salt = await genSalt(SALT_ROUNDS)
  return hash(p, salt)
}

export async function verifyPin(pin: string, hashValue: string): Promise<boolean> {
  const p = normalizePin(pin)
  if (typeof hashValue !== 'string' || hashValue.length < 10) {
    return false
  }
  return compare(p, hashValue)
}

export function isFourDigitPin(pin: string): boolean {
  return /^\d{4}$/.test(String(pin))
}
