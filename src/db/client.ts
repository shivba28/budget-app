import * as SQLite from 'expo-sqlite'
import { drizzle } from 'drizzle-orm/expo-sqlite'

import * as schema from './schema'

const DB_NAME = 'budget-tracker.db'

/** Open DB + Drizzle client only — no migrations/seed (avoids require cycles with queries). */
export const sqlite = SQLite.openDatabaseSync(DB_NAME)
export const db = drizzle(sqlite, { schema })
