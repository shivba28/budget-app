# Budget Tracker

A privacy-first personal finance app built with React Native and Expo. All data is stored locally on-device using SQLite — no accounts, no cloud, no data sharing.

## Features

- **Bank Sync via Teller** — link real bank accounts and automatically import transactions
- **Manual Transactions** — add cash, card, or any custom transaction manually
- **Categories & Budgets** — create custom categories with color labels and set monthly spending limits
- **Insights** — spending breakdowns by category and merchant, budget vs. actual, anomaly detection, and duplicate charge alerts
- **Trip Tracking** — group expenses by trip with optional budget caps and cost-splitting
- **PIN + Biometrics** — unlock with a 4-digit PIN, Face ID, or Touch ID
- **Inactivity Lock** — auto-locks after configurable inactivity period

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | [Expo](https://expo.dev) ~55 (managed workflow) |
| Language | TypeScript (strict mode) |
| Routing | [Expo Router](https://expo.github.io/router) (file-based) |
| State | [Zustand](https://github.com/pmndrs/zustand) |
| Database | `expo-sqlite` + [Drizzle ORM](https://orm.drizzle.team) |
| Styling | [NativeWind](https://www.nativewind.dev) (Tailwind CSS for RN) |
| Charts | [Victory Native](https://commerce.nearform.com/open-source/victory-native) + [Skia](https://shopify.github.io/react-native-skia) |
| Animations | [Reanimated](https://docs.swmansion.com/react-native-reanimated) |
| Lists | [@shopify/flash-list](https://shopify.github.io/flash-list) |
| Data Fetching | [TanStack Query](https://tanstack.com/query) |
| Bank Integration | [Teller](https://teller.io) |
| Security | `expo-secure-store`, `expo-local-authentication`, `bcryptjs` |

## Project Structure

```
budget-app-react-native/
├── app/                        # Expo Router screens (file-based routing)
│   ├── _layout.tsx             # Root layout (DB init, auth hydration)
│   ├── index.tsx               # Auth gate redirector
│   ├── onboarding.tsx          # First-launch onboarding
│   ├── setup-pin.tsx           # PIN creation
│   ├── unlock.tsx              # PIN / biometric unlock
│   └── app/                   # Protected routes (requires unlock)
│       ├── (tabs)/            # Bottom tab navigation
│       │   ├── transactions.tsx
│       │   ├── insights.tsx
│       │   ├── trips/
│       │   └── settings.tsx
│       ├── categories.tsx
│       ├── budgets.tsx
│       ├── bank-accounts.tsx
│       ├── manual-accounts.tsx
│       ├── transaction-new.tsx
│       ├── transaction-edit/[id].tsx
│       └── trip-new.tsx
└── src/
    ├── auth/                   # PIN hashing, biometrics, inactivity watcher
    ├── stores/                 # Zustand stores (one per entity)
    ├── db/                     # SQLite schema, migrations, seed, queries
    ├── lib/
    │   ├── insights/           # Analytics engine (spending, anomalies, budgets)
    │   ├── teller/             # Teller API client and sync logic
    │   └── transactions/       # Filtering and grouping utilities
    ├── components/             # Reusable UI components
    └── theme/                  # Design tokens (neo-brutalist palette)
```

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org) (LTS recommended)
- [Expo CLI](https://docs.expo.dev/get-started/installation/) — `npm install -g expo-cli`
- iOS Simulator (Mac only) or Android Emulator, or a physical device with [Expo Go](https://expo.dev/client)

### Install

```bash
git clone <repo-url>
cd budget-app-react-native
npm install
```

### Run

```bash
npm run start     # Start Expo dev server (scan QR with Expo Go)
npm run ios       # Open in iOS Simulator
npm run android   # Open in Android Emulator
npm run web       # Open in browser
```

### Environment Variables (optional — Teller bank sync)

Create a `.env` file in the project root:

```env
EXPO_PUBLIC_TELLER_APP_ID=your_teller_app_id
EXPO_PUBLIC_TELLER_ENV=sandbox         # sandbox | development | production
EXPO_PUBLIC_TELLER_CONNECT_URL=        # Optional: override hosted Connect URL
```

After changing env vars, clear the Metro cache:

```bash
npx expo start -c
```

Bank sync is completely optional. The app works fully offline without any Teller credentials.

## Navigation & Auth Flow

```
App Launch
    │
    ├─ First launch ──▶ Onboarding ──▶ Set PIN ──▶ Unlock screen
    │
    └─ Returning    ──▶ Unlock screen (PIN or biometrics)
                              │
                              └─ Unlocked ──▶ Main App (tabs)
                                              ├─ Transactions
                                              ├─ Insights
                                              ├─ Trips
                                              └─ Settings
```

## Database Schema

All data is stored locally in `budget-tracker.db` (SQLite) using Drizzle ORM.

| Table | Purpose |
|---|---|
| `transactions` | All income/expense records (bank-synced or manual) |
| `accounts` | Bank accounts (via Teller) and manual accounts |
| `teller_enrollments` | Linked bank enrollment metadata (tokens in Secure Store) |
| `categories` | User-defined and system categories with colors |
| `trips` | Trip definitions with optional budget limits |
| `budgets` | Per-category monthly spending limits |
| `app_meta` | Key/value store for app settings and sync timestamps |

Teller access tokens are **never stored in SQLite** — they live in `expo-secure-store` (iOS Keychain / Android Keystore).

## How Budgeting Works

1. **Set budgets** — assign a monthly spending limit per category (e.g. Groceries: $500) and optionally a total monthly cap.
2. **Sync or add transactions** — pull-to-refresh imports bank transactions via Teller; manual entries can be added anytime.
3. **Effective date override** — when allocating a transaction to a trip or correcting timing, an `effective_date` can override the bank's posted date. This controls which month the transaction counts toward.
4. **Insights** — the analytics engine groups spending by category, compares against budgets, calculates utilization percentages, and flags anomalies and duplicate charges.
5. **Trip allocation** — tag transactions to a trip; use `my_share` to split shared expenses. Trip costs roll into monthly insights.

## Security

- **PIN** — 4-digit PIN hashed with bcryptjs and stored in `expo-secure-store`
- **Biometrics** — Face ID / Touch ID via `expo-local-authentication`
- **Inactivity lock** — configurable timeout auto-locks the app after period of inactivity
- **No remote accounts** — no email, no password, no cloud storage; all data stays on device

## Design System

The app uses a **neo-brutalist** aesthetic: hard edges (no border radius), 2–4px solid borders, a cream/ink/yellow palette, and bold typography. UI components are defined in `src/components/Brutalist.tsx`.

## Build & Deploy

This project uses [EAS Build](https://docs.expo.dev/build/introduction/) for production builds.

```bash
npm install -g eas-cli
eas build --platform ios
eas build --platform android
```

EAS project ID: `045e1335-3c6d-4cf6-8e45-6f56a9837acf`

## License

Private — all rights reserved.
