# Cursor Prompt: Budget Tracker → React Native Conversion

> **How to use this file**: Paste this entire document into a new Cursor conversation as your opening message. It gives Cursor the full project context, the target architecture, and a phased build plan. Reference specific phases as you work through each one.

---

## Your Role

You are a senior React Native / Expo engineer helping me convert an existing web PWA into a fully offline-first React Native app. You have access to the full spec below. Before writing any code, read everything in this prompt carefully. Ask clarifying questions if anything is ambiguous before proceeding with each phase.

---

## Source App: Budget Tracker PWA (Full Spec)

### What it does

Personal finance app (single user) that combines:
- **Bank-synced transactions** via Teller (link bank → fetch accounts → fetch transactions → persist locally)
- **Manual transactions** for accounts tracked by hand (Apple Card CSV, cash)
- **Allocations** that reinterpret spend for budgeting:
  - **Effective date** — defer a transaction to a different budget month
  - **Trip assignment** — group transactions into a travel/event budget
  - **My share** — override the amount used in Insights (e.g. split costs)
  - **Category override** — per-transaction category reassignment
- **Insights**: category spend, month-over-month changes, cash flow, anomalies/duplicates, recurring charges, budget health
- **Security UX**: Google sign-in + local unlock via 4-digit PIN and/or passkeys (WebAuthn)

### Current PWA tech stack

- **Frontend**: Vite + React 19 + TypeScript, React Router v7, Tailwind CSS v4, Framer Motion, Recharts, TanStack Virtual
- **Backend (being eliminated)**: Node/Express on Render, Postgres on Neon
- **Auth**: Google OAuth (server-side), session cookies, bcrypt PIN, WebAuthn passkeys
- **Banking**: `teller-connect-react` (web SDK), server-side mTLS Teller client
- **Hosting**: Vercel (frontend) + Render (API)

### Current data models (Postgres — being replaced with SQLite)

**transactions**: `id`, `account_id`, `date`, `effective_date`, `trip_id`, `my_share`, `amount`, `description`, `category`, `detail_category`, `pending`, `user_confirmed`, `source` (`bank`|`manual`), `account_label`

**accounts**: `id`, `name`, `institution`, `type`, `enrollment_id`, `last_seen_tx_id`, `last_synced`, `depository_amounts_inverted`

**teller_enrollments**: `enrollment_id`, `access_token`, `institution_name`

**categories**: `id`, `label`, `color`, `source` (`teller`|`user`)

**trips**: `id`, `name`, `start_date`, `end_date`, `budget_limit`, `color`

**budgets**: `id`, `category`, `amount`, `month` (currently always `'default'`)

**users**: `id` (Google sub), `email`, `name`, `avatar_url`

**sessions / webauthn_credentials / pins**: auth infrastructure — being replaced (see Target Architecture below)

### Current screens

| Route | Screen |
|---|---|
| `/` | Landing carousel (first-run) |
| `/login` | Google sign-in |
| `/setup-pin` | Create 4-digit PIN |
| `/setup-passkey` | Register passkey |
| `/unlock` | Unlock with PIN or passkey |
| `/app/transactions` | Transaction list + filters + allocation sheet |
| `/app/insights` | Analytics dashboard |
| `/app/trips` | Trip list |
| `/app/trips/:id` | Trip detail |
| `/app/settings` | Settings: bank accounts, budgets, categories, PIN, passkeys |

### Current API endpoints (being eliminated — all logic moves on-device)

The following backend routes existed; their logic must be reimplemented as local TypeScript modules in the RN app:

- Auth: Google OAuth, session, PIN verify/set/change, WebAuthn register/verify
- Teller proxy: store enrollment token, fetch accounts, fetch + sync transactions (with incremental sync logic)
- User data CRUD: transactions, categories, trips, budgets, allocations

---

## Target Architecture: Fully Offline-First React Native App

### Core principle

**No backend server. No cloud database. Everything lives on the device.**

Internet is used for exactly two operations:
1. **Teller bank account linking** (WebView flow)
2. **Teller transaction sync** (direct HTTPS calls from the app to Teller's API, using tokens stored in secure on-device storage)

All other features — browsing transactions, insights, trips, budgets, categories, settings — work 100% offline.

### Target tech stack

| Layer | Technology | Notes |
|---|---|---|
| Framework | **Expo SDK 52** (managed workflow) | Use bare workflow only if a required native module forces it |
| Language | TypeScript (strict mode) | Match field names from existing data models exactly |
| Navigation | **Expo Router v4** (file-based) | Replaces React Router; mirrors existing screen structure |
| Local DB | **expo-sqlite** + **Drizzle ORM** | Replaces Neon Postgres. Schema mirrors existing tables exactly |
| Secure storage | **expo-secure-store** | Teller access tokens, PIN hash, Google user info |
| Auth | **Google Sign-In** via `@react-native-google-signin/google-signin` | ID token stored locally; no server session |
| PIN | Bcrypt hash stored in expo-secure-store | `react-native-bcrypt` or WASM port |
| Passkeys | **expo-passkeys** or `react-native-passkey` | On-device WebAuthn; evaluate library maturity at build time |
| Banking | **Teller Connect** via `expo-web-browser` (WebView flow) | Opens Teller's hosted connect page; returns enrollment token via deep link / redirect |
| Teller API | Direct HTTPS from app | mTLS certs bundled in app assets (evaluate Teller's mobile guidance for cert handling) |
| State | **Zustand** | One store per domain (transactions, accounts, trips, budgets, categories, auth) |
| Sync layer | **TanStack Query** (`@tanstack/react-query`) | For Teller network calls only; all local reads bypass React Query |
| Charts | **Victory Native XL** | Replaces Recharts |
| Virtualized list | **FlashList** (`@shopify/flash-list`) | Replaces TanStack Virtual |
| Animations | **React Native Reanimated 3** | Replaces Framer Motion |
| Gestures | **React Native Gesture Handler** | Swipe on transaction rows |
| Notifications | **expo-notifications** (local only) | Budget alert push notifications; no internet needed |
| Styling | **NativeWind v4** | Tailwind for React Native; design tokens defined in `theme.ts` |
| File access | **expo-document-picker** | Apple Card CSV import |
| CSV parsing | **papaparse** | Existing CSV import logic port |

### Design system: Neo-Brutalist + Pencil-Drawn

This is a **full visual redesign**. Do not carry over the PWA's visual style.

**Aesthetic principles:**
- Raw, deliberate imperfection. Thick borders (2–4px), black, with hard offset shadows (no blur — `shadowOffset: {width: 4, height: 4}, shadowOpacity: 1, shadowRadius: 0`)
- Flat solid color fills — no gradients, no blur, no soft shadows
- Pencil/sketch-drawn illustrations for empty states, onboarding, and icons (`react-native-svg` paths with `strokeLinecap: 'round'`, slight imperfection in coordinates)
- Bold slab or condensed grotesque display font (e.g. `Archivo Black`)
- Monospace body font (e.g. `IBM Plex Mono`) for amounts, labels, metadata
- Cream/off-white base (`#F5F0E8`), black borders/text (`#111111`), acid yellow accent (`#F5E642`), red for debits (`#E63946`), sage green for credits (`#8DB580`)
- Rectangles with minimal rounding (border-radius 4–6px max)
- All caps for section labels

**Design token file** (`src/theme/tokens.ts`) must be created in Phase 1 and imported everywhere — no hardcoded colors, no hardcoded spacing.

---

## Local Database Schema (SQLite via Drizzle)

Mirror the existing Postgres schema exactly. Use snake_case column names. Add these new columns where needed:

```sql
-- transactions
CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  date TEXT NOT NULL,             -- ISO 8601
  effective_date TEXT,            -- allocation override
  trip_id INTEGER,                -- FK trips.id
  my_share REAL,                  -- allocation override
  amount REAL NOT NULL,
  description TEXT NOT NULL,
  category TEXT,
  detail_category TEXT,
  pending INTEGER NOT NULL DEFAULT 0,   -- boolean
  user_confirmed INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'bank',  -- 'bank' | 'manual'
  account_label TEXT,
  synced_at TEXT                        -- ISO timestamp of last sync
);

-- accounts
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  name TEXT,
  institution TEXT,
  type TEXT,
  enrollment_id TEXT NOT NULL,
  last_seen_tx_id TEXT,
  last_synced TEXT,
  depository_amounts_inverted INTEGER NOT NULL DEFAULT 0
);

-- teller_enrollments
CREATE TABLE teller_enrollments (
  enrollment_id TEXT PRIMARY KEY,
  institution_name TEXT
  -- access_token stored in expo-secure-store, NOT in SQLite
);

-- categories
CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  color TEXT,
  source TEXT NOT NULL DEFAULT 'user'
);

-- trips
CREATE TABLE trips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  start_date TEXT,
  end_date TEXT,
  budget_limit REAL,
  color TEXT,
  created_at TEXT NOT NULL
);

-- budgets
CREATE TABLE budgets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  amount REAL NOT NULL,
  month TEXT NOT NULL DEFAULT 'default'
);

-- app_meta (key-value store for flags and cursors)
CREATE TABLE app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- Keys used:
--   'onboarding_complete'       → '1'
--   'google_user'               → JSON { sub, email, name, avatar_url }
--   'pin_hash'                  → bcrypt hash (or store in expo-secure-store)
--   'last_unlock_at'            → ISO timestamp
--   'inactivity_timeout_ms'     → number string (default '900000')
```

**Security note**: Teller `access_token` values are **never written to SQLite**. They live exclusively in `expo-secure-store` keyed by `enrollment_id`.

---

## Teller Integration (Mobile)

Since there is no native Teller SDK for React Native, the flow works as follows:

### Linking flow

1. User taps "Add bank account" in Settings
2. App opens Teller's hosted connect URL via `expo-web-browser` (`WebBrowser.openAuthSessionAsync`)
3. Teller redirects back to the app via a deep link (`yourapp://teller-callback?token=...&enrollment_id=...`)
4. App receives the deep link, extracts `token` and `enrollment_id`
5. App stores `access_token` in `expo-secure-store` under key `teller_token_<enrollment_id>`
6. App inserts a row into `teller_enrollments` with `enrollment_id` and `institution_name`
7. App immediately fetches accounts for the new enrollment (online)

### Sync flow

```
User triggers sync (pull-to-refresh or Settings → Sync now)
  │
  ▼
Check network (NetInfo)
  ├─ Offline → toast "Sync unavailable offline", abort
  └─ Online ──────────────────────────────────────────┐
                                                      ▼
                                        For each enrollment in teller_enrollments:
                                          Read access_token from expo-secure-store
                                          GET https://api.teller.io/accounts
                                            (mTLS cert from app bundle)
                                          Upsert accounts into SQLite
                                                      │
                                        For each account:
                                          GET https://api.teller.io/accounts/:id/transactions
                                            ?count=...&from_id=last_seen_tx_id
                                          Map Teller fields → local schema
                                          Upsert into transactions table
                                          Update accounts.last_seen_tx_id
                                          Update accounts.last_synced
                                                      │
                                                      ▼
                                        Re-run budget alert checks (local)
                                        Fire expo-notifications if thresholds crossed
```

### mTLS certificate handling

- Teller requires mTLS for all API calls
- Bundle `certificate.pem` and `private_key.pem` in the app's asset directory
- Use a fetch wrapper that attaches the client certificate (evaluate `react-native-ssl-pinning` or `rn-fetch-blob` for cert attachment at build time — confirm approach before implementing)
- **Never commit real production certs to git** — use Expo secrets or `.gitignore`

---

## Auth Architecture (No Server)

| Concern | PWA approach | RN approach |
|---|---|---|
| Identity | Google OAuth server-side | Google Sign-In on-device (`@react-native-google-signin`) — get ID token, decode sub/email locally |
| Session | httpOnly cookie | No session. Auth state held in Zustand + persisted to `app_meta` |
| PIN | bcrypt hash in Postgres | bcrypt hash in `expo-secure-store` |
| Passkeys | WebAuthn via backend | `expo-passkeys` on-device |
| Teller tokens | Postgres `teller_enrollments` | `expo-secure-store` per enrollment |
| Inactivity lock | Server-side session window | Client-side timer in Zustand auth store |

---

## Feature Parity Checklist

Every feature from the PWA must be replicated in the RN app. Mark each as done as you go:

- [ ] First-run onboarding carousel (pencil-drawn illustrations)
- [ ] Google Sign-In
- [ ] PIN setup / verify / change
- [ ] Passkey setup / verify
- [ ] Inactivity lock (configurable timeout)
- [ ] Unlock screen (PIN + passkey)
- [ ] Bank account linking via Teller (WebView)
- [ ] Accounts list with sync status
- [ ] Transaction sync (incremental, with 30-day refresh window for pending)
- [ ] Depository sign normalization (`depository_amounts_inverted`)
- [ ] Transaction list grouped by month (virtualized)
- [ ] Search + filters (date preset, category, direction, source)
- [ ] Allocation sheet per transaction:
  - [ ] Defer to date (effective_date)
  - [ ] Add to trip / create new trip inline
  - [ ] My share override
  - [ ] Category override
  - [ ] Mark as posted (pending)
  - [ ] Clear allocation
- [ ] Manual transaction create / edit / delete
- [ ] Apple Card CSV import
- [ ] Insights dashboard:
  - [ ] Category spend (pie/donut chart)
  - [ ] Top merchants
  - [ ] Largest purchases
  - [ ] Month-over-month deltas
  - [ ] Cash flow (income vs expenses, 6-month table)
  - [ ] Anomalies + possible duplicates
  - [ ] Recurring charge detection
  - [ ] Budget health (projection vs cap)
  - [ ] Commitment blocks (trip-based)
- [ ] Trips list with spend totals + budget progress
- [ ] Trip detail (by-category, assigned transactions)
- [ ] Trip create / edit / delete
- [ ] Settings:
  - [ ] Theme toggle
  - [ ] Sign out + clear local data
  - [ ] Passkeys management (add / remove)
  - [ ] PIN change / reset
  - [ ] Categories (create / edit color / delete)
  - [ ] Manual accounts list
  - [ ] Bank accounts (link / sync / disconnect per enrollment)
  - [ ] Budgets (per-category + total cap)
  - [ ] Budget alert notifications (threshold config, per-category toggle)

---

## Phased Migration Plan

Work through phases in order. **Do not start a new phase until the current phase is fully working.**

---

### Phase 0 — Project Scaffold

**Goal**: Runnable Expo app with correct folder structure, design system, and DB wired up.

Tasks:
1. `npx create-expo-app budget-tracker-rn --template expo-template-blank-typescript`
2. Install all dependencies from the target stack table
3. Set up Expo Router v4 with the full route structure (mirror existing screens)
4. Create `src/theme/tokens.ts` with the full neo-brutalist design token set
5. Create `src/db/schema.ts` with all Drizzle table definitions (mirror schema above exactly)
6. Create `src/db/index.ts` — open SQLite DB, run Drizzle migrations on app start
7. Create `src/db/migrate.ts` — idempotent migration runner
8. Set up NativeWind v4 with the custom theme
9. Create a placeholder screen for every route — just a Text label, no logic
10. Verify: app boots, navigates between placeholder screens, DB initializes without error

**Deliverable**: A clean scaffolded project that boots on iOS simulator and Android emulator.

---

### Phase 1 — Auth (Google Sign-In + PIN + Passkeys + Unlock)

**Goal**: Full auth flow works end-to-end with local storage only.

Tasks:
1. Implement Google Sign-In (`@react-native-google-signin`) — store decoded user info in `app_meta`
2. Implement Zustand auth store: `{ user, isAuthenticated, isUnlocked, lockScreen, unlock }`
3. Build onboarding carousel screen (pencil-drawn SVG illustrations via `react-native-svg`)
4. Build Login screen (Google Sign-In button, neo-brutalist styled)
5. Build PIN setup screen — validate 4 digits, hash with bcrypt, store in `expo-secure-store`
6. Build PIN verify screen — compare against stored hash, update `last_unlock_at` in `app_meta`
7. Build Passkey setup screen — `expo-passkeys` registration flow
8. Build Passkey verify screen — `expo-passkeys` authentication flow
9. Build Unlock screen — supports PIN and/or passkey, whichever user has configured
10. Implement inactivity lock timer in Zustand — reads `inactivity_timeout_ms` from `app_meta`
11. Route guard: any `/app/*` screen checks `isUnlocked` and redirects to `/unlock` if false

**Deliverable**: Can sign in with Google, set up PIN, lock/unlock the app, works fully offline.

---

### Phase 2 — Local Data Layer (SQLite + Zustand Stores)

**Goal**: All CRUD operations work locally. No Teller yet.

Tasks:
1. Create Drizzle query helpers for every table (`src/db/queries/transactions.ts`, etc.)
2. Create Zustand stores for: transactions, accounts, trips, budgets, categories
3. Each store: `{ items, load, add, update, remove }` — loads from SQLite, writes back to SQLite
4. Build Categories screen — create, edit color, delete
5. Build Budgets screen — per-category limits + total cap
6. Build Manual Accounts list in Settings
7. Build Manual Transaction create/edit/delete flow
8. Build Trips list screen + Trip detail screen
9. Build Trip create/edit/delete
10. Seed the DB with a handful of test transactions for UI development

**Deliverable**: Can create manual transactions, trips, budgets, categories. All data survives app restart.

---

### Phase 3 — Transaction List + Allocation

**Goal**: Full transaction browsing and allocation UX works on local data.

Tasks:
1. Build Transaction List screen:
   - Grouped by month with collapsible sections
   - FlashList virtualization
   - Search bar (filter by description / merchant)
   - Filter chips: date preset, category, cash flow direction, source
   - Pending transactions hidden unless `user_confirmed = true`
2. Build Allocation bottom sheet (per-transaction):
   - Defer to date
   - Add to trip (with inline trip create)
   - My share
   - Category override
   - Mark as posted (pending)
   - Clear allocation
3. Swipe gesture on transaction row (React Native Gesture Handler) → open allocation sheet
4. Write allocation update logic to SQLite via Drizzle

**Deliverable**: Can browse, filter, search, and fully allocate transactions from local seed data.

---

### Phase 4 — Teller Integration (Bank Linking + Sync)

**Goal**: Can link a real bank and sync real transactions.

Tasks:
1. Configure deep link scheme in `app.json` (e.g. `budgettracker://`)
2. Implement bank linking flow:
   - Open Teller Connect URL via `WebBrowser.openAuthSessionAsync`
   - Handle deep link callback, extract `token` and `enrollment_id`
   - Store `access_token` in `expo-secure-store`
   - Insert row into `teller_enrollments` SQLite table
3. Create Teller HTTP client (`src/lib/teller/client.ts`):
   - Attaches mTLS client certificate (bundled in assets)
   - Base URL: `https://api.teller.io`
   - Auth: Basic auth with `access_token` as username, empty password
4. Implement accounts fetch: `GET /accounts` → upsert into SQLite
5. Implement transaction sync:
   - Incremental sync using `last_seen_tx_id` as cursor
   - 30-day refresh window for pending transactions (keep syncing even if `stopAtId` seen)
   - Depository sign normalization (`depository_amounts_inverted` flag — one-time fix)
   - Map Teller fields → local schema (port logic from `api/src/teller/txMap.ts`)
   - Upsert into `transactions` table
   - Delete pending rows superseded by posted duplicates
   - Update `last_seen_tx_id` and `last_synced` on account row
6. Build Bank Accounts settings screen:
   - List linked accounts with institution, account name, last synced
   - "Sync now" button (per account or global)
   - Disconnect enrollment (removes from `expo-secure-store` + `teller_enrollments`)
   - Include / exclude individual accounts from insights
7. Pull-to-refresh on Transaction list triggers sync
8. "Last synced: X ago" indicator

**Deliverable**: Can link a real bank, sync transactions, and see them in the transaction list.

---

### Phase 5 — Insights Dashboard

**Goal**: Full analytics screen works on local SQLite data (zero network calls).

Tasks:
1. Port all insights computation logic from the PWA frontend to local TypeScript utility functions in `src/lib/insights/`:
   - Category spend (respects `my_share`, uses `effective_date` for month grouping)
   - Month-over-month deltas
   - Top merchants
   - Largest purchases
   - Cash flow (income vs expenses, 6-month)
   - Anomaly detection (outlier transactions)
   - Duplicate detection (same merchant, same amount, close dates)
   - Recurring charge detection (same merchant, similar amount, monthly cadence)
   - Budget health (actual vs limit, projection to end of month)
   - Commitment blocks (trip-based spend views)
2. Build Insights screen with period selector (This Week / This Month / Last Month / Custom)
3. Implement donut chart (category spend) via Victory Native XL
4. Implement bar chart (daily spend over 30 days)
5. Implement 6-month cash flow table
6. Implement anomaly + duplicate cards (dismissible, reset on next sync)
7. Implement recurring charges list
8. Implement budget health progress bars

**Deliverable**: Insights screen fully functional offline from real synced data.

---

### Phase 6 — Notifications

**Goal**: Budget alerts fire locally.

Tasks:
1. Configure `expo-notifications` — request permissions on first run
2. Implement budget alert checker (run after every sync and after every budget change):
   - Compare actual spend vs budget limits per category
   - Fire local notification at 80% and 100% thresholds
   - Configurable thresholds and per-category toggle in Settings
   - Quiet hours support

**Deliverable**: Budget alerts fire as local notifications.

---

### Phase 7 — Polish, Edge Cases, and App Store Prep

**Goal**: Production-ready.

Tasks:
1. Error boundaries on all screens
2. Empty states with pencil-drawn SVG illustrations for: no transactions, no trips, no linked accounts, no insights data
3. Loading skeletons (neo-brutalist style — thick bordered placeholder blocks)
4. Offline banner (persistent when no network detected via NetInfo)
5. Sync error handling — surface Teller API errors gracefully
6. Enrollment token expiry handling — prompt re-link when Teller returns 401
7. Data export (CSV) from Settings
8. Clear all local data / sign out flow (wipes SQLite + expo-secure-store)
9. App icon + splash screen (pencil-drawn, neo-brutalist)
10. Expo EAS Build setup (`eas.json`)
11. iOS: configure associated domains for deep links, add Info.plist entries for camera/Face ID
12. Android: configure `AndroidManifest.xml` for deep links and permissions
13. Test on physical devices (iOS + Android)
14. Submit to TestFlight / Play Console internal testing

---

## Important Implementation Notes

- **Never store Teller access tokens in SQLite.** Always use `expo-secure-store`.
- **All insights computations are local.** Never make a network call from the Insights screen.
- **The `effective_date` field drives month grouping in Insights**, not `date`. Port this logic exactly.
- **`my_share` overrides amount in Insights** but not in the transaction list display — keep them separate.
- **Pending transactions are hidden** unless `user_confirmed = true`. This must be enforced in the FlashList data filter, not in the DB query.
- **Depository sign normalization** (`depository_amounts_inverted`): this is a one-time migration flag per account. Once flipped, it should not re-flip. Port the exact logic from `api/src/teller/txMap.ts`.
- **Incremental sync cursor** (`last_seen_tx_id`): Teller returns transactions newest-first. Store the ID of the newest transaction after each sync. On next sync, stop paginating when this ID is seen — unless within the 30-day refresh window for pending resolution.
- **Design tokens are non-negotiable.** Every color, spacing value, font, and shadow must come from `src/theme/tokens.ts`. No exceptions.

---

## File Structure (Target)

```
budget-tracker-rn/
├── app/                          # Expo Router screens
│   ├── index.tsx                 # Entry gate → landing or auth check
│   ├── login.tsx
│   ├── setup-pin.tsx
│   ├── setup-passkey.tsx
│   ├── unlock.tsx
│   └── app/
│       ├── _layout.tsx           # Tab navigator
│       ├── transactions.tsx
│       ├── insights.tsx
│       ├── trips/
│       │   ├── index.tsx
│       │   └── [tripId].tsx
│       └── settings.tsx
├── src/
│   ├── theme/
│   │   └── tokens.ts             # All design tokens
│   ├── db/
│   │   ├── index.ts              # Open DB, run migrations
│   │   ├── schema.ts             # Drizzle table definitions
│   │   ├── migrate.ts            # Migration runner
│   │   └── queries/              # One file per table
│   │       ├── transactions.ts
│   │       ├── accounts.ts
│   │       ├── trips.ts
│   │       ├── budgets.ts
│   │       ├── categories.ts
│   │       └── appMeta.ts
│   ├── stores/                   # Zustand stores
│   │   ├── auth.ts
│   │   ├── transactions.ts
│   │   ├── accounts.ts
│   │   ├── trips.ts
│   │   ├── budgets.ts
│   │   └── categories.ts
│   ├── lib/
│   │   ├── teller/
│   │   │   ├── client.ts         # mTLS fetch wrapper
│   │   │   ├── sync.ts           # Incremental sync logic
│   │   │   └── txMap.ts          # Teller field → local schema mapping
│   │   ├── insights/             # All analytics computation
│   │   │   ├── categorySpend.ts
│   │   │   ├── cashFlow.ts
│   │   │   ├── anomalies.ts
│   │   │   ├── recurring.ts
│   │   │   └── budgetHealth.ts
│   │   ├── csv/
│   │   │   └── appleCard.ts      # Apple Card CSV import
│   │   └── notifications.ts      # Budget alert checker
│   └── components/
│       ├── ui/                   # Design system components
│       │   ├── BrutalCard.tsx
│       │   ├── BrutalButton.tsx
│       │   ├── BrutalInput.tsx
│       │   └── SketchIcon.tsx    # SVG pencil-drawn icons
│       ├── transactions/
│       ├── insights/
│       ├── trips/
│       └── settings/
├── assets/
│   ├── certs/                    # Teller mTLS certs (gitignored in prod)
│   │   ├── certificate.pem
│   │   └── private_key.pem
│   └── illustrations/            # Pencil-drawn SVG empty state art
├── app.json
├── eas.json
├── drizzle.config.ts
└── tailwind.config.ts
```

---

## Questions to Resolve Before Starting Phase 4

Before implementing Teller on mobile, confirm the following with Teller's documentation or support:

1. Does Teller's hosted Connect flow support a custom URI scheme deep link as the redirect URL for mobile apps?
2. What is the correct mTLS certificate attachment method for `fetch` in React Native / Expo managed workflow?
3. Does Teller sandbox support mobile app credentials, or is a separate mobile app registration needed?

---

## Ready to Start

Begin with **Phase 0**. Scaffold the project, set up the DB, and get a runnable app with placeholder screens. Confirm each task is complete before moving to Phase 1.
