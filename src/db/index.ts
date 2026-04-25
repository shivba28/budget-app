import { sqlite } from './client'
import { runMigrations } from './migrate'
import { runSeedIfNeeded } from './seed'

export { sqlite, db } from './client'

let initialized = false

export async function ensureDbReady(): Promise<void> {
  if (initialized) return
  await runMigrations(sqlite)
  runSeedIfNeeded()
  initialized = true
}
