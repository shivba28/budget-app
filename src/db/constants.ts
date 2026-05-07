/** Non-Teller accounts use this sentinel `accounts.enrollment_id`. */
export const MANUAL_ENROLLMENT_ID = 'manual'

export const META_PHASE2_SEEDED = 'phase2_seeded'
export const META_BUDGET_TOTAL_CAP = 'budget_monthly_total'
export const META_LAST_TELLER_SYNC_AT = 'last_teller_sync_at'

// ── Background sync ──────────────────────────────────────────────────────────
/** ISO timestamp of last successful background sync. */
export const META_LAST_BG_SYNC_AT = 'last_bg_sync_at'
/** Number of new transactions added by the most recent background sync. */
export const META_LAST_BG_SYNC_NEW_COUNT = 'last_bg_sync_new_count'

// ── Notifications (Phase 6) ──────────────────────────────────────────────────
/** Stored JSON: thresholds, quiet hours, per-category toggles. */
export const META_BUDGET_ALERT_SETTINGS = 'budget_alert_settings'
/** Stored JSON: last fired threshold per (month, category). */
export const META_BUDGET_ALERT_STATE = 'budget_alert_state'
/** Stored flag: permissions prompt already shown once. */
export const META_NOTIFICATIONS_PERMISSION_ASKED = 'notifications_permission_asked'
/** Stored JSON: last date we scheduled recurring bill reminders. */
export const META_RECURRING_REMINDERS_LAST_RUN = 'recurring_reminders_last_run'
