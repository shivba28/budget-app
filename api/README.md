# Unified API

TypeScript sources live under `src/`:

- `src/routes/auth/` — Google OAuth, PIN, WebAuthn (`routes.ts`, `webauthnRoutes.ts`)
- `src/routes/sync/` — Drive backup (`routes.ts`)
- `src/routes/teller/` — Teller proxy HTTP routes (`tellerRoutes.ts`)
- `src/auth/` — session stores, crypto, config (migrated from `../server/src`)
- `src/teller/lib/` — `tellerClient.ts`, `teller.cjs` (CommonJS proxy), `static/` (migrated from `../backend`)

Build emits to `dist/`; `index.js` at the package root imports `./dist/index.js`.
