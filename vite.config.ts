import path from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const unifiedApiTarget =
    env.VITE_API_PROXY_TARGET?.replace(/\/$/, '') ||
    env.VITE_API_URL?.replace(/\/$/, '') ||
    'http://localhost:4000'

  return {
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      // Main bundle includes React, Recharts, maps, etc. — above default 500 kB warning.
      chunkSizeWarningLimit: 1200,
    },
    plugins: [
      tailwindcss(),
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg', 'pwa-192x192.png', 'pwa-512x512.png'],
        manifest: {
          name: 'Budget Tracker',
          short_name: 'Budget',
          description: 'Budget tracking PWA with bank sync',
          display: 'standalone',
          orientation: 'portrait',
          background_color: '#fafafa',
          theme_color: '#171717',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: 'pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
          ],
        },
      }),
    ],
    server: {
      port: 5174,
      host: true,
      proxy: {
        // Unified API (auth + Teller + sync). No path rewrite — server mounts at /api/auth, /api/teller, /api/sync.
        '/api': {
          target: unifiedApiTarget,
          changeOrigin: true,
        },
      },
    },
  }
})
