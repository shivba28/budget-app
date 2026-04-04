import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { config } from './config/env.js'

const FILE_NAME = 'user-pins.json'

interface PinEntry {
  pinHash: string
  updatedAt: string
}

interface StoreFile {
  pins: Record<string, PinEntry>
}

function pinStorePath(): string {
  const dir = join(process.cwd(), config.dataDir)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return join(dir, FILE_NAME)
}

function readStore(): StoreFile {
  const p = pinStorePath()
  if (!existsSync(p)) return { pins: {} }
  try {
    const raw = readFileSync(p, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || !('pins' in parsed)) {
      return { pins: {} }
    }
    const pins = (parsed as StoreFile).pins
    if (!pins || typeof pins !== 'object') return { pins: {} }
    return { pins: pins as Record<string, PinEntry> }
  } catch {
    return { pins: {} }
  }
}

function writeStore(s: StoreFile): void {
  const p = pinStorePath()
  const tmp = `${p}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(tmp, JSON.stringify(s, null, 2), 'utf8')
  renameSync(tmp, p)
}

export function getUserPinHash(googleSub: string): string | null {
  return readStore().pins[googleSub]?.pinHash ?? null
}

export function setUserPinHash(googleSub: string, pinHash: string): void {
  const s = readStore()
  s.pins[googleSub] = { pinHash, updatedAt: new Date().toISOString() }
  writeStore(s)
}

export function clearUserPin(googleSub: string): void {
  const s = readStore()
  if (s.pins[googleSub]) {
    delete s.pins[googleSub]
    writeStore(s)
  }
}
