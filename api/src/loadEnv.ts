/**
 * Must be imported before `./config/env.js` or any module that reads `process.env`.
 * (ESM hoists imports; inline dotenv in index.ts runs too late.)
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadEnv } from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
/* Load both .env.local (if present) and .env, matching Vite-ish precedence. */
loadEnv({ path: path.resolve(__dirname, '../.env.local'), override: false })
loadEnv({ path: path.resolve(__dirname, '../.env'), override: false })
