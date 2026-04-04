/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /** Unified API origin (auth + Teller + sync), e.g. http://localhost:4000 or your Render URL. */
  readonly VITE_API_URL?: string
  /** @deprecated Use VITE_API_URL */
  readonly VITE_SYNC_API_URL?: string
  /** @deprecated Use VITE_API_URL + /api/teller */
  readonly VITE_BACKEND_URL?: string
  readonly VITE_API_BASE_URL?: string
  readonly VITE_TELLER_APPLICATION_ID?: string
  /** Teller Connect application id */
  readonly VITE_TELLER_APP_ID?: string
  /** Override unified API target for Vite dev proxy only */
  readonly VITE_API_PROXY_TARGET?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
