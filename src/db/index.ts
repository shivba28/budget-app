import * as SQLite from 'expo-sqlite'
import { drizzle } from 'drizzle-orm/expo-sqlite'
import { runMigrations } from './migrate'
import { runSeedIfNeeded } from './seed'
import * as schema from './schema'

const DB_NAME = 'budget-tracker.db'

let initialized = false

export const sqlite = SQLite.openDatabaseSync(DB_NAME)
export const db = drizzle(sqlite, { schema })

export async function ensureDbReady(): Promise<void> {
  if (initialized) return
  await runMigrations(sqlite)
  runSeedIfNeeded()
  initialized = true
}

