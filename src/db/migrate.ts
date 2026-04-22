import { type SQLiteDatabase } from 'expo-sqlite'

const MIGRATIONS = [
  // transactions
  `CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    date TEXT NOT NULL,
    effective_date TEXT,
    trip_id INTEGER,
    my_share REAL,
    amount REAL NOT NULL,
    description TEXT NOT NULL,
    category TEXT,
    detail_category TEXT,
    pending INTEGER NOT NULL DEFAULT 0,
    user_confirmed INTEGER NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'bank',
    account_label TEXT,
    synced_at TEXT
  );`,

  // accounts
  `CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    name TEXT,
    institution TEXT,
    type TEXT,
    enrollment_id TEXT NOT NULL,
    last_seen_tx_id TEXT,
    last_synced TEXT,
    depository_amounts_inverted INTEGER NOT NULL DEFAULT 0,
    include_in_insights INTEGER NOT NULL DEFAULT 1
  );`,

  // teller_enrollments (tokens stored in SecureStore, not SQLite)
  `CREATE TABLE IF NOT EXISTS teller_enrollments (
    enrollment_id TEXT PRIMARY KEY,
    institution_name TEXT,
    user_id TEXT,
    status TEXT,
    last_sync_at TEXT,
    last_error TEXT
  );`,

  // categories
  `CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    color TEXT,
    source TEXT NOT NULL DEFAULT 'user'
  );`,

  // trips
  `CREATE TABLE IF NOT EXISTS trips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    start_date TEXT,
    end_date TEXT,
    budget_limit REAL,
    color TEXT,
    created_at TEXT NOT NULL
  );`,

  // budgets
  `CREATE TABLE IF NOT EXISTS budgets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    amount REAL NOT NULL,
    month TEXT NOT NULL DEFAULT 'default'
  );`,

  // app_meta
  `CREATE TABLE IF NOT EXISTS app_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );`,
] as const

export async function runMigrations(db: SQLiteDatabase): Promise<void> {
  // expo-sqlite (SDK 54) supports async execAsync APIs.
  for (const sql of MIGRATIONS) {
    await db.execAsync(sql)
  }
  try {
    await db.execAsync(
      'ALTER TABLE accounts ADD COLUMN include_in_insights INTEGER NOT NULL DEFAULT 1',
    )
  } catch {
    /* column already exists */
  }
  try {
    await db.execAsync('ALTER TABLE teller_enrollments ADD COLUMN user_id TEXT')
  } catch {
    /* column already exists */
  }
  try {
    await db.execAsync('ALTER TABLE teller_enrollments ADD COLUMN status TEXT')
  } catch {
    /* column already exists */
  }
  try {
    await db.execAsync('ALTER TABLE teller_enrollments ADD COLUMN last_sync_at TEXT')
  } catch {
    /* column already exists */
  }
  try {
    await db.execAsync('ALTER TABLE teller_enrollments ADD COLUMN last_error TEXT')
  } catch {
    /* column already exists */
  }
}

