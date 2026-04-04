import './loadEnv.js'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import express from 'express'
import { applyAuthRoutes } from './routes/auth/routes.js'
import { applyWebAuthnRoutes } from './routes/auth/webauthnRoutes.js'
import { applySyncRoutes } from './routes/sync/routes.js'
import { applyTellerRoutes } from './routes/teller/tellerRoutes.js'
import { config } from './auth/config/env.js'

const port = config.port

function originMatches(allowed: string, origin: string): boolean {
  if (allowed === origin) return true
  if (allowed.includes('*')) {
    try {
      const a = new URL(allowed.replace('*', 'wildcard'))
      const o = new URL(origin)
      if (a.protocol !== o.protocol) return false
      const hostPattern = a.host.replace('wildcard', '*')
      if (hostPattern.startsWith('*.')) {
        const suffix = hostPattern.slice(1)
        return o.host.endsWith(suffix)
      }
    } catch {
      return false
    }
  }
  return false
}

const app = express()
app.set('trust proxy', 1)
app.use(cookieParser(config.sessionSecret))
app.use(express.json({ limit: '12mb' }))
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true)
      const ok = config.frontendOrigins.some((a) => originMatches(a, origin))
      return callback(null, ok)
    },
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
)

applyAuthRoutes(app)
applyWebAuthnRoutes(app)
applySyncRoutes(app)
applyTellerRoutes(app)

if (config.isProd) {
  app.use((req, res, next) => {
    if (req.get('x-forwarded-proto') === 'http') {
      const host = req.headers.host
      if (host) {
        return res.redirect(301, `https://${host}${req.url}`)
      }
    }
    return next()
  })
  app.use((_req, res, next) => {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
    next()
  })
}

app.get('/health', (_req, res) => {
  res.status(200).json({ ok: true })
})

app.listen(port, () => {
  console.log(`Unified API listening on http://localhost:${port}`)
})
