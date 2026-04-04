# Budget app

## Running Locally

Use two terminals (unified API on port **4000**, Vite PWA on **5174**).

**Terminal 1 — API**

```bash
cd api && npm install && npm run dev
```

**Terminal 2 — frontend (Vite app is at the repository root: `package.json`, `vite.config.ts`, `src/`)**

```bash
npm install && npm run dev
```

Copy `api/.env.example` to `api/.env` and configure OAuth/Teller. Copy `frontend/.env.example` to `.env` at the repository root and set `VITE_API_URL=http://localhost:4000` so the browser hits the unified API (or rely on the defaults in `syncApi` / `api.ts`).

The legacy `server/` and `backend/` folders are unchanged for comparison during migration.

### Deploy

- **Render:** `render.yaml` builds and runs the service in `api/` (`npm install && npm run build`, then `node index.js`). Set environment variables in the dashboard; use a persistent disk for `DATA_DIR` if you need session files to survive restarts.
- **Vercel:** Connect the repo and use the root `vercel.json` (Vite build → `dist`, SPA rewrites). Set `VITE_API_URL` to your Render API URL. If you later move the Vite app under `frontend/`, point the Vercel project root there and adjust paths.
