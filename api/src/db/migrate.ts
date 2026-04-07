import { dbEnabled, pool, query } from './pool.js'

const STATEMENTS = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS teller_enrollments (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  enrollment_id TEXT NOT NULL,
  access_token TEXT NOT NULL,
  institution_name TEXT,
  PRIMARY KEY (user_id, enrollment_id)
);

CREATE TABLE IF NOT EXISTS webauthn_credentials (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL,
  public_key TEXT NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  transports TEXT[] NOT NULL DEFAULT '{}'::text[],
  device TEXT NOT NULL,
  name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, credential_id),
  UNIQUE (credential_id)
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT,
  institution TEXT,
  type TEXT,
  enrollment_id TEXT,
  last_seen_tx_id TEXT,
  last_synced TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);

CREATE TABLE IF NOT EXISTS trips (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  budget_limit NUMERIC,
  color TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transactions (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  date DATE NOT NULL,
  effective_date DATE,
  trip_id INTEGER REFERENCES trips(id) ON DELETE SET NULL,
  amount NUMERIC,
  description TEXT,
  category TEXT,
  detail_category TEXT,
  pending BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id, account_id) REFERENCES accounts(user_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS budgets (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  month TEXT NOT NULL,
  UNIQUE(user_id, category, month)
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  encrypted_refresh_token TEXT NOT NULL,
  google_sub TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  pin_verified_until TIMESTAMPTZ NULL,
  pin_last_activity_at TIMESTAMPTZ NULL,
  pin_failures INTEGER NOT NULL DEFAULT 0,
  pin_locked_until TIMESTAMPTZ NULL,
  auth_method TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions (user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_user_account ON transactions (user_id, account_id);
CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts (user_id);
CREATE INDEX IF NOT EXISTS idx_trips_user ON trips (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_google_sub_expires ON sessions (google_sub, expires_at DESC);
CREATE INDEX IF NOT EXISTS idx_webauthn_user ON webauthn_credentials (user_id);
CREATE INDEX IF NOT EXISTS idx_webauthn_last_used ON webauthn_credentials (user_id, last_used_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_trips_user_name_start ON trips (user_id, name, start_date);

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS last_seen_tx_id TEXT;

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS depository_amounts_inverted BOOLEAN NOT NULL DEFAULT FALSE;
`

let migrated = false

export async function runMigrationsIfNeeded(): Promise<void> {
  if (!dbEnabled() || !pool || migrated) return
  const parts = STATEMENTS.split(';')
    .map((s) => s.trim())
    .filter(Boolean)
  for (const sql of parts) {
    await query(`${sql};`)
  }
  migrated = true
  console.log('[db] Migrations applied (if not already present).')
}
