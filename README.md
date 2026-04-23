# Budget Tracker

Personal budget tracking PWA with bank sync (Teller), manual transactions, trips, and spending insights. This README is written as a **developer spec** so a new contributor (or AI coding assistant) can understand the app end-to-end: architecture, features, data models, and API contracts.

## Project Overview

**Budget Tracker** is a personal finance app for a single user (currently). It combines:

- **Bank-synced transactions** via Teller (link bank → fetch accounts → fetch transactions → persist to Postgres).
- **Manual transactions** for accounts you track by hand (e.g. Apple Card, cash).
- **Allocations** that let you reinterpret spend for budgeting:
  - **Effective date** (“defer to date”) to move a transaction into a different budget month.
  - **Trip assignment** to group transactions into a travel/event budget.
  - **My share** to override the amount used in Insights (e.g. split costs).
  - **Category override** per-transaction.
- **Insights**: category spend, month-over-month changes, cash flow, anomalies/duplicates, recurring charges, and budget health.
- **Security UX**: Google sign-in + local unlock using a 4-digit code (PIN) and/or passkeys (WebAuthn).

## Tech Stack

### Frontend

- **Vite** (`vite` ^8) + **React** (`react` ^19) + **TypeScript** (~5.9)
- **Routing**: `react-router-dom` ^7
- **Styling**: Tailwind CSS ^4 (+ `tailwind-merge`, `class-variance-authority`, `tw-animate-css`)
- **UI**: `@aejkatappaja/phantom-ui`, `@base-ui/react`, `lucide-react`, `framer-motion`
- **Charts**: `recharts` ^3
- **Virtualized list**: `@tanstack/react-virtual` (Transactions list)
- **PWA**: `vite-plugin-pwa` (service worker auto-update)
- **Analytics (Vercel)**: `@vercel/analytics`, `@vercel/speed-insights`
- **Teller Connect**: `teller-connect-react` (bank linking in-browser)

### Backend (“unified API”)

`api/` is a standalone Node 20+ Express app mounted behind `/api/*`.

- **Runtime**: Node `>=20`
- **Framework**: Express ^4
- **DB**: Postgres (production: **Neon**) via `pg`
- **Auth**:
  - **Google OAuth** (via `google-auth-library` + `googleapis`)
  - **Session cookies** (httpOnly) + server-side session store (DB when enabled; file-backed when DB disabled)
  - **PIN hashing**: `bcryptjs`
  - **Passkeys**: `@simplewebauthn/server`
- **CORS**: `cors` with credentialed cookies

### Hosting / Deployment

- **Frontend**: Vercel (build output: `dist/`, SPA rewrites)
- **Backend**: Render (Blueprint: `render.yaml`, default port `4000`)
- **Cookies**: Designed for cross-site SPA+API (Vercel + Render). See `COOKIE_*` env vars in backend.

## Architecture Overview

### Frontend ↔ Backend communication

- Frontend uses **relative `/api/...`** in dev via Vite proxy, and in production Vercel rewrites `/api/*` to the Render API.
- Auth uses a **session cookie** (`budget_sid`, httpOnly). Frontend requests use `credentials: "include"` / `axios.withCredentials = true`.

Key client API bases:

- **Auth + user data**: `${base}/api/auth/*` and `${base}/api/user/*`
- **Teller proxy**: `${base}/api/teller/*`

### Teller integration flow (linking + sync)

#### 1) Link a bank (frontend)

- User goes to **Settings → Bank accounts** and opens **Teller Connect** (`teller-connect-react`).
- On success, Teller returns a `TellerConnectEnrollment` including:
  - `enrollment.accessToken` (enrollment access token)
  - `enrollment.enrollment.id` (enrollment id)
  - institution name (best-effort extracted)

Frontend immediately calls:

```http
POST /api/teller/auth/token
Content-Type: application/json
Cookie: budget_sid=...

{
  "token": "<teller_access_token>",
  "enrollmentId": "<enrollment_id>",
  "institutionName": "Chase"
}
```

#### 2) Store the enrollment token (backend)

Backend behavior depends on whether Postgres is enabled (i.e. `DATABASE_URL` set):

- **DB enabled (production)**:
  - Requires an authenticated user session.
  - Stores enrollment tokens in Postgres table `teller_enrollments` keyed by `(user_id, enrollment_id)`.
- **DB disabled (local dev option)**:
  - Stores enrollment tokens in an in-memory token map (process memory).

#### 3) Fetch accounts (frontend → backend → Teller)

Frontend calls:

```http
GET /api/teller/accounts
Cookie: budget_sid=...
```

Backend fetches accounts from Teller for each stored enrollment token, aggregates them, and when DB is enabled:

- Upserts `accounts` rows (per user) with `id`, `name`, `institution`, `type`, `enrollment_id`, `last_synced`.

#### 4) Fetch transactions and persist (sync)

Frontend sync loop:

- For each linked account:

```http
GET /api/teller/transactions?account_id=<acct>&enrollment_id=<enrollment>
Cookie: budget_sid=...
```

Backend transaction sync details:

- Fetches Teller transactions **newest-first** and paginates backwards.
- Implements **incremental sync** via `accounts.last_seen_tx_id`:
  - Stops when hitting `stopAtId` *unless* within the most recent **30-day refresh window**, where it keeps going to refresh pending status.
- When DB is enabled, for each returned Teller transaction:
  - Maps it into app fields (see `api/src/teller/txMap.ts`).
  - Upserts into `transactions` (per user, id is Teller transaction id).
  - Auto-creates/refreshes `categories` rows for Teller-provided category labels (source=`teller`).
  - Re-applies stored allocations (effective date + trip id) onto the response payload.
  - Performs cleanup:
    - Deletes pending rows superseded by posted duplicates.
    - Optionally reconciles orphan rows when a full tail fetch was performed.
- Special-case: for **depository** accounts, the backend may flip stored transaction sign once (`depository_amounts_inverted`) to normalize historical data.

### Data movement: bank → backend → frontend → local storage

- **Bank → backend**: Teller data is fetched server-side via a Teller client that uses mTLS (development/production).
- **Backend → frontend**:
  - Teller endpoints return raw-ish Teller objects (plus allocation fields injected when DB is enabled).
  - User endpoints (`/api/user/*`) return normalized app payloads (transactions, trips, budgets, categories).
- **Frontend local storage**:
  - Frontend maintains a local cache in `localStorage` for:
    - transactions, accounts, category overrides, categories cache, monthly budgets, manual accounts, UI flags, etc.
  - In “local storage mode” (`VITE_USE_LOCAL_STORAGE=true`), trips/transactions/budgets/categories can be fully stored locally for offline/dev usage.

## Features

### Routing map (screens)

- `/` — entry gate: shows Landing carousel until dismissed, then routes based on auth status
- `/login` — Google sign-in entry
- `/setup-pin` — create a 4-digit app code (PIN)
- `/setup-passkey` — register a passkey (WebAuthn)
- `/unlock` — unlock app with PIN and/or passkey
- `/app/transactions` — transactions list + filters + allocation sheet + add/edit manual transactions
- `/app/insights` — analytics dashboard (month selector)
- `/app/trips` — list of trips with spend and progress vs budget
- `/app/trips/:tripId` — trip detail, by-category spend, assigned transactions, edit/delete
- `/app/settings` — app settings, bank linking, budgets, categories, manual accounts, passkeys, PIN change/reset

### Landing (`/`)

- **What it does**: First-run carousel describing value prop (demo charts + security slide).
- **How it works**: Stored flag `budget-app:seen-landing` gates whether Landing is shown.
- **Data touched**: `localStorage` only.

### Login (`/login`)

- **What it does**: Starts Google OAuth via the backend.
- **How it works**: “Continue with Google” navigates to `/api/auth/google/start` (server sets signed state cookie, redirects to Google).
- **Edge cases**:
  - OAuth errors are surfaced via `?sync=error&reason=...` and shown in the UI.
  - Cookie misconfiguration (cross-site) can cause “state” errors; backend emits debug hints in dev.

### Setup unlock method (`/setup-pin`, `/setup-passkey`)

The app requires at least one “unlock” method after Google sign-in.

- **PIN setup**:
  - UI validates 4 digits; sends `POST /api/auth/pin/set`.
  - PIN is stored server-side as a hash (bcrypt), keyed by `googleSub`.
- **Passkey setup**:
  - Uses WebAuthn registration flow via backend routes (`/api/auth/webauthn/register/*`).
  - Stores passkey credential (public key + counter) in Postgres when DB enabled.

### Unlock (`/unlock`)

- **What it does**: Unlocks the app while Google session is active.
- **How it works**:
  - PIN: `POST /api/auth/pin/verify` updates session unlock window.
  - Passkey: WebAuthn authenticate verifies assertion and mints a new session cookie.
  - After unlock, the client hydrates server caches and (if linked accounts exist) triggers a background bank sync.
- **Edge cases**:
  - Some browsers apply Set-Cookie slightly late after WebAuthn; client polls `/api/auth/me` until unlock is visible.

### Transactions (`/app/transactions`)

- **What it does**:
  - Displays transactions grouped by month with expandable sections.
  - Search + filters: date preset (incl. custom), category, cash flow direction, source (bank/manual).
  - Manual transaction create/edit/delete.
  - Per-transaction allocation via bottom sheet.
  - “Sync” button pulls bank activity (server mode).
- **How it works**:
  - Initial load uses cached transactions if available; otherwise fetches server data or runs a sync.
  - List is virtualized for performance.
  - Pending bank transactions are **hidden** unless the user marked them “Posted”.
- **Data touched**:
  - `localStorage`: transactions cache, category overrides, exclusions, etc.
  - DB-backed API: `/api/user/*` for persisted data
  - Teller sync: `/api/teller/*`

#### Allocation sheet (Transaction actions)

From a transaction row:

- **Defer to date**: sets `effectiveDate` (moves budget month).
- **Add to trip**: sets `tripId` (and can create a new trip inline).
- **My share**: sets `myShare` numeric override (used in Insights for spend).
- **Change category**: writes a local override mapping `transactionId → categoryId`.
- **Mark as Posted** (pending only): sets `userConfirmed=true` so the row is shown even while pending upstream.
- **Clear allocation**: clears effective date + trip + my share.
- **Manual transaction actions**: edit or delete.

### Trips (`/app/trips`, `/app/trips/:tripId`)

- **What it does**:
  - Create trips (name, date range, optional budget limit).
  - Shows per-trip spend totals and a progress bar if a budget limit exists.
  - Trip detail shows totals, by-category spend, and assigned transactions (using “my share” where present).
- **How it works**:
  - Trips are hydrated from the server (`/api/user/trips`) into local storage cache.
  - Trip assignment is performed from the transaction allocation sheet.
  - Deleting a trip clears assignments but keeps transactions.

### Insights (`/app/insights`)

- **What it does**:
  - Spending by category (pie), top merchants, largest purchases
  - Month-over-month category deltas
  - Cash flow (income vs expenses), 6-month table
  - Anomalies + possible duplicates
  - Recurring charge detection
  - Budget health (projection vs cap, by category)
  - Commitment blocks (trip-based committed spend views)
- **Important semantics**:
  - “Spend” includes **outflows only**; deposits/refunds are not counted as spend.
  - Insights uses `myShare` (if set) to compute spend for a transaction.

### Settings (`/app/settings`)

Tabbed:

- **App settings**: theme, sign out, passkeys, PIN change/reset, categories (create/delete, color), manual accounts list
- **Bank accounts**: Teller Connect link, sync now, disconnect per enrollment, account include/exclude
- **Budgets**: per-category overrides, optional overall cap, notifications

## Data Models

This app uses two parallel “data backends”:

- **Server mode (production)**: Postgres (Neon) is authoritative for user data.
- **Local storage mode**: when `VITE_USE_LOCAL_STORAGE=true`, key user data can be stored locally for offline/dev.

### Postgres schema (authoritative in production)

The backend creates tables on startup (idempotent) in `api/src/db/migrate.ts`.

#### `users`

| Field | Type | Notes |
|---|---|---|
| `id` | `text` | Primary key = Google `sub` |
| `email` | `text` | Unique, not null |
| `name` | `text` | Nullable |
| `avatar_url` | `text` | Nullable |
| `created_at` | `timestamptz` | Default `now()` |

#### `sessions`

| Field | Type | Notes |
|---|---|---|
| `id` | `text` | Primary key; stored in cookie `budget_sid` |
| `encrypted_refresh_token` | `text` | Encrypted at rest by server |
| `google_sub` | `text` | Google user id |
| `email` | `text` | Cached email |
| `created_at` | `timestamptz` | Default `now()` |
| `expires_at` | `timestamptz` | Session expiry |
| `pin_verified_until` | `timestamptz` | Unlock window |
| `pin_last_activity_at` | `timestamptz` | Used for inactivity lock |
| `pin_failures` | `int` | PIN failure counter |
| `pin_locked_until` | `timestamptz` | Lockout |
| `auth_method` | `text` | e.g. `'passkey'` |

#### `webauthn_credentials`

| Field | Type | Notes |
|---|---|---|
| `user_id` | `text` | FK → `users(id)` |
| `credential_id` | `text` | Primary key per user; globally unique |
| `public_key` | `text` | base64url |
| `counter` | `int` | signature counter (best-effort) |
| `transports` | `text[]` | |
| `device` | `text` | User label |
| `name` | `text` | Nullable |
| `created_at` | `timestamptz` | |
| `last_used_at` | `timestamptz` | |

#### `teller_enrollments`

| Field | Type | Notes |
|---|---|---|
| `user_id` | `text` | FK → `users(id)` |
| `enrollment_id` | `text` | Teller enrollment id |
| `access_token` | `text` | Teller enrollment access token |
| `institution_name` | `text` | Nullable |
| PK | `(user_id, enrollment_id)` | |

#### `accounts`

| Field | Type | Notes |
|---|---|---|
| `id` | `text` | Teller account id |
| `user_id` | `text` | FK → `users(id)` |
| `name` | `text` | Nullable |
| `institution` | `text` | Nullable |
| `type` | `text` | Teller account type |
| `enrollment_id` | `text` | Teller enrollment id |
| `last_seen_tx_id` | `text` | Incremental sync cursor |
| `last_synced` | `timestamptz` | |
| `depository_amounts_inverted` | `boolean` | One-time sign fix flag |
| PK | `(user_id, id)` | |

#### `transactions`

| Field | Type | Notes |
|---|---|---|
| `user_id` | `text` | FK → `users(id)` |
| `id` | `text` | Teller tx id or UUID for manual |
| `account_id` | `text` | FK → `accounts(user_id,id)` |
| `date` | `date` | Posting date |
| `effective_date` | `date` | Allocation override |
| `trip_id` | `int` | FK → `trips(id)` nullable |
| `my_share` | `numeric` | Allocation override |
| `amount` | `numeric` | |
| `description` | `text` | |
| `category` | `text` | Category id (often `teller:*` or `user:*`) |
| `detail_category` | `text` | Teller label |
| `pending` | `boolean` | |
| `user_confirmed` | `boolean` | pending-as-posted flag |
| `source` | `text` | `'bank'` or `'manual'` |
| `account_label` | `text` | Manual display label |
| PK | `(user_id, id)` | |

#### `categories`

| Field | Type | Notes |
|---|---|---|
| `user_id` | `text` | FK → `users(id)` |
| `id` | `text` | `teller:<slug>` or `user:<slug>` |
| `label` | `text` | |
| `color` | `text` | Hex |
| `source` | `text` | `'teller'` or `'user'` |
| `created_at` | `timestamptz` | |

#### `trips`

| Field | Type | Notes |
|---|---|---|
| `id` | `serial` | Primary key |
| `user_id` | `text` | FK → `users(id)` |
| `name` | `text` | |
| `start_date` | `date` | |
| `end_date` | `date` | Nullable |
| `budget_limit` | `numeric` | Nullable |
| `color` | `text` | Nullable |
| `created_at` | `timestamptz` | |

#### `budgets`

| Field | Type | Notes |
|---|---|---|
| `id` | `serial` | Primary key |
| `user_id` | `text` | FK → `users(id)` |
| `category` | `text` | Category id; special key `__total_cap__` |
| `amount` | `numeric` | |
| `month` | `text` | Currently always `'default'` |

## API Endpoints

All routes are served by the unified API and accessed by the frontend via `/api/*`.

### Health

#### `GET /health`

```json
{ "ok": true }
```

### Auth: Google OAuth + sessions

#### `GET /api/auth/google/start`

- Optional query: `intent=pin_reset`
- Redirects to Google OAuth

#### `GET /api/auth/google/callback`

- Sets cookie `budget_sid`
- Redirects to `FRONTEND_URL` with `?sync=ok` or `?sync=error&reason=...`

#### `GET /api/auth/me`

Returns either:

```json
{
  "authenticated": false,
  "pinConfigured": false,
  "pinUnlocked": false,
  "hasPasskeys": false,
  "hasPin": false
}
```

or:

```json
{
  "authenticated": true,
  "email": "you@example.com",
  "pinConfigured": true,
  "pinUnlocked": false,
  "hasPasskeys": true,
  "hasPin": true
}
```

#### `POST /api/auth/logout`

- Response: `204`

### PIN

#### `POST /api/auth/pin/heartbeat`

- Response: `204`

#### `POST /api/auth/pin/set`

```json
{ "pin": "1234", "pinConfirm": "1234" }
```

- Response: `204`

#### `POST /api/auth/pin/verify`

```json
{ "pin": "1234" }
```

- Response: `204` (or `401` / `429`)

#### `POST /api/auth/pin/change`

```json
{ "currentPin": "1234", "newPin": "5678", "newPinConfirm": "5678" }
```

- Response: `204` (or `401` / `403`)

### WebAuthn (passkeys)

#### `GET /api/auth/webauthn/register/check`

```json
{ "hasPasskeys": true, "credentialCount": 2, "lastUsedAt": "2026-04-16T..." }
```

#### `GET /api/auth/webauthn/credentials`

```json
{ "credentials": [] }
```

#### `POST /api/auth/webauthn/register/start`

```json
{ "device": "MacBook Pro" }
```

Response: WebAuthn registration options JSON.

#### `POST /api/auth/webauthn/register/verify`

Request: WebAuthn `RegistrationResponseJSON`.

#### `POST /api/auth/webauthn/authenticate/start`

```json
{ "googleSub": "..." }
```

Response: WebAuthn request options JSON.

#### `POST /api/auth/webauthn/authenticate/verify`

Request: WebAuthn `AuthenticationResponseJSON`.

#### `DELETE /api/auth/webauthn/credential/:credentialId`

- Response: `204`

### Teller proxy

#### `POST /api/teller/auth/token`

```json
{
  "token": "<teller_enrollment_access_token>",
  "enrollmentId": "<enrollment_id>",
  "institutionName": "Chase"
}
```

#### `DELETE /api/teller/auth/token`

Clears all enrollments for the user.

#### `DELETE /api/teller/auth/enrollment/:enrollmentId`

Clears a single enrollment.

#### `GET /api/teller/accounts`

Returns Teller accounts (aggregated).

#### `GET /api/teller/transactions?account_id=...&enrollment_id=...`

Returns `{ "transactions": [...] }` with optional injected allocation fields when DB is enabled.

### User data (DB required): `/api/user/*`

#### `GET /api/user/transactions`

```json
{ "transactions": [] }
```

#### `POST /api/user/transactions` (manual only)

```json
{
  "description": "Apple Store",
  "date": "2026-04-16",
  "amount": 199.99,
  "categoryId": "food",
  "accountLabel": "Apple Card",
  "manualAccountId": "uuid"
}
```

#### `PATCH /api/user/transactions/:id`

- Mark posted:

```json
{ "userConfirmed": true }
```

- Update manual:

```json
{
  "description": "Apple Store",
  "date": "2026-04-16",
  "amount": 199.99,
  "categoryId": "food",
  "accountLabel": "Apple Card",
  "manualAccountId": "uuid"
}
```

#### `DELETE /api/user/transactions/:id` (manual only)

- Response: `204`

#### `PATCH /api/user/transactions/:id/allocate`

```json
{ "type": "none" }
```

```json
{ "type": "date", "effective_date": "2026-05-01" }
```

```json
{ "type": "trip", "trip_id": 12 }
```

```json
{ "type": "my_share", "my_share": 25.5 }
```

#### `GET /api/user/categories`

```json
{ "categories": [] }
```

#### `POST /api/user/categories`

```json
{ "label": "Coffee", "color": "#22c55e" }
```

#### `PATCH /api/user/categories/:id`

```json
{ "color": "#22c55e" }
```

#### `DELETE /api/user/categories/:id`

- Response: `204`

#### `GET /api/user/trips`

```json
{ "trips": [] }
```

#### `POST /api/user/trips`

```json
{ "name": "Japan", "start_date": "2026-06-01", "end_date": null, "budget_limit": 3500, "color": null }
```

#### `PATCH /api/user/trips/:id`

Partial patch body.

#### `DELETE /api/user/trips/:id`

- Response: `204`

#### `GET /api/user/budgets`

```json
{ "v": 1, "categories": {}, "totalMonthly": null }
```

#### `PUT /api/user/budgets`

```json
{ "v": 1, "categories": { "food": 400 }, "totalMonthly": 2500 }
```

## State Management

The app primarily uses **React local state + an explicit storage/cache module** (`src/lib/storage.ts`) rather than a single global store library.

- **Local component state**: filters, open sheets, form inputs
- **Local storage**: transactions cache, category overrides, budgets, theme, landing flag, categories cache, manual accounts
- **Server state**: authoritative persistence in Postgres (Neon) for user data

## Offline / PWA Behavior

- PWA is enabled via `vite-plugin-pwa` with `registerType: autoUpdate`.
- The service worker denies SPA navigation fallback for `/api/*` to avoid swallowing auth/OAuth callbacks.
- Offline support is strongest in **local storage mode** (`VITE_USE_LOCAL_STORAGE=true`), where trips/transactions/budgets/categories can work without network.

## Authentication & Security

- **Identity**: Google OAuth
- **Session**: httpOnly cookie `budget_sid`
- **Unlock**: PIN (bcrypt hash stored server-side) and/or WebAuthn passkeys
- **Teller tokens**: stored server-side (`teller_enrollments` in Postgres when DB enabled)

## Environment Variables

### Frontend (`.env` at repo root)

| Variable | Required | Example | Description |
|---|---:|---|---|
| `VITE_TELLER_APP_ID` | Yes (bank linking) | `app_...` | Teller Connect app id |
| `VITE_API_URL` | Recommended (prod) | `https://<render-host>` | Unified API base origin |
| `VITE_API_PROXY_TARGET` | Optional (dev) | `http://localhost:4000` | Vite proxy target for `/api` |
| `VITE_USE_LOCAL_STORAGE` | Optional | `true` | Use localStorage backend for user data |
| `VITE_PIN_INACTIVITY_TIMEOUT_MS` | Optional | `900000` | Client-side inactivity lock; `0` disables |

### Backend (`api/.env`)

| Variable | Required | Example | Description |
|---|---:|---|---|
| `PORT` | Yes | `4000` | API port |
| `NODE_ENV` | Yes | `development` / `production` | Prod enables HSTS/https redirect |
| `DATABASE_URL` | Yes (prod) | `postgresql://...` | Neon Postgres URL |
| `SESSION_SECRET` | Yes (prod) | random | Session signing/encryption secret |
| `GOOGLE_CLIENT_ID` | Yes | | Google OAuth client id |
| `GOOGLE_CLIENT_SECRET` | Yes | | Google OAuth client secret |
| `GOOGLE_REDIRECT_URI` | Yes | `http://localhost:4000/api/auth/google/callback` | OAuth callback |
| `FRONTEND_ORIGIN` | Yes | `http://localhost:5174` | CORS allowlist (comma-separated) |
| `FRONTEND_URL` | Yes | `http://localhost:5174` | Redirect target after login |
| `DATA_DIR` | Yes (no DB) | `/var/data` | File store for sessions/passkeys when DB disabled |
| `WEBAUTHN_RP_ID` | Yes | `localhost` | WebAuthn RP id |
| `WEBAUTHN_RP_NAME` | Yes | `Budget Tracker` | WebAuthn RP name |
| `WEBAUTHN_ORIGIN` | Yes | `http://localhost:5174` | Allowed origins (comma-separated) |
| `TELLER_ENV` | Yes | `development` | `sandbox` \| `development` \| `production` |
| `TELLER_APP_ID` | Yes | `app_...` | Must match frontend |
| `TELLER_CERT_PATH` | Yes (dev/prod) | `./certs/certificate.pem` | Teller mTLS cert |
| `TELLER_KEY_PATH` | Yes (dev/prod) | `./certs/private_key.pem` | Teller mTLS key |
| `COOKIE_SAMESITE` | Optional | `none` | Needed for cross-site cookies (Vercel + Render) |

## Setup & Running Locally

Use two terminals (unified API on port **4000**, Vite PWA on **5174**).

### Install

```bash
npm install
cd api && npm install
```

### Configure env

```bash
cp .env.example .env
cp api/.env.example api/.env
```

Optional offline/dev mode (no Postgres):

- In repo root `.env`: set `VITE_USE_LOCAL_STORAGE=true`
- In `api/.env`: leave `DATABASE_URL` empty/unset

### Run dev servers

API:

```bash
cd api && npm run dev
```

Frontend:

```bash
npm run dev
```

### Deploy

- **Render**: `render.yaml` builds and runs `api/`. Use a persistent disk for `DATA_DIR` if you rely on file-backed sessions.
- **Vercel**: root `vercel.json` builds `dist/` and rewrites `/api/*` to Render.

## Known Issues / Tech Debt

- None recorded.

## Future / Out of Scope

- No explicit out-of-scope list yet.
