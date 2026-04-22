import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'

// Mirror the conversion prompt schema (snake_case columns).

export const transactions = sqliteTable('transactions', {
  id: text('id').primaryKey(),
  account_id: text('account_id').notNull(),
  date: text('date').notNull(),
  effective_date: text('effective_date'),
  trip_id: integer('trip_id'),
  my_share: real('my_share'),
  amount: real('amount').notNull(),
  description: text('description').notNull(),
  category: text('category'),
  detail_category: text('detail_category'),
  pending: integer('pending').notNull().default(0),
  user_confirmed: integer('user_confirmed').notNull().default(0),
  source: text('source').notNull().default('bank'),
  account_label: text('account_label'),
  synced_at: text('synced_at'),
})

export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(),
  name: text('name'),
  institution: text('institution'),
  type: text('type'),
  enrollment_id: text('enrollment_id').notNull(),
  last_seen_tx_id: text('last_seen_tx_id'),
  last_synced: text('last_synced'),
  depository_amounts_inverted: integer('depository_amounts_inverted')
    .notNull()
    .default(0),
  include_in_insights: integer('include_in_insights').notNull().default(1),
})

export const teller_enrollments = sqliteTable('teller_enrollments', {
  enrollment_id: text('enrollment_id').primaryKey(),
  institution_name: text('institution_name'),
  /** Teller user id (metadata only; never store access_token here). */
  user_id: text('user_id'),
  /**
   * Enrollment health: 'connected' or 'disconnected'. This is derived from recent sync attempts.
   * Never store access tokens here.
   */
  status: text('status'),
  last_sync_at: text('last_sync_at'),
  last_error: text('last_error'),
})

export const categories = sqliteTable('categories', {
  id: text('id').primaryKey(),
  label: text('label').notNull(),
  color: text('color'),
  source: text('source').notNull().default('user'),
})

export const trips = sqliteTable('trips', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  start_date: text('start_date'),
  end_date: text('end_date'),
  budget_limit: real('budget_limit'),
  color: text('color'),
  created_at: text('created_at').notNull(),
})

export const budgets = sqliteTable('budgets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  category: text('category').notNull(),
  amount: real('amount').notNull(),
  month: text('month').notNull().default('default'),
})

export const app_meta = sqliteTable('app_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
})

