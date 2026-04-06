# Unified API

TypeScript sources live under `src/`:

- `src/routes/auth/` — Google OAuth, PIN, WebAuthn (`routes.ts`, `webauthnRoutes.ts`)
- `src/routes/user/` — Postgres-backed user data (transactions, trips, budgets, migrate)
- `src/routes/teller/` — Teller proxy HTTP routes (`tellerRoutes.ts`)
- `src/auth/` — session store, crypto, config
- `src/db/` — migrations, repositories
- `src/teller/lib/` — `tellerClient.ts`, `teller.cjs` (CommonJS proxy), `static/`

Build emits to `dist/`; `index.js` at the package root imports `./dist/index.js`.
