import MutualTls from '@a-cube-io/expo-mutual-tls'

import { getTellerEnvironment } from '@/src/lib/teller/connect'

// Password used when creating assets/certs/teller.p12:
//   openssl pkcs12 -export -certpbe AES-256-CBC -keypbe AES-256-CBC -macalg SHA256 \
//     -in certificate.pem -inkey private_key.pem -out teller.p12 -passout pass:teller
const P12_PASSWORD = 'teller'
const P12_KEYCHAIN_SERVICE = 'teller.p12'

let configured = false

async function getP12Base64(): Promise<string> {
  // On EAS build servers the file is unavailable (gitignored), so the base64
  // content is injected via the TELLER_P12_BASE64 EAS secret instead.
  const fromEnv = process.env.TELLER_P12_BASE64
  if (fromEnv && fromEnv.length > 100) return fromEnv

  // Local development: read from the bundled asset file.
  // (0, eval)('require') defeats Metro's static resolver — it won't bundle the
  // path at all, so the missing file on EAS causes no bundling error.
  // The env-var branch above returns before this line ever runs on EAS.
  const [{ Asset }, FileSystem] = await Promise.all([
    import('expo-asset'),
    import('expo-file-system/legacy'),
  ])
  // eslint-disable-next-line no-eval
  const assetModule = (0, eval)('require')('../../../assets/certs/teller.p12')
  const [asset] = await Asset.loadAsync(assetModule)
  const uri = asset?.localUri ?? asset?.uri
  if (!uri) throw new Error('Missing asset URI for teller.p12')
  return (FileSystem as any).readAsStringAsync(uri, {
    encoding: (FileSystem as any).EncodingType?.Base64 ?? 'base64',
  })
}

/**
 * Configure and store the Teller mTLS identity.
 * No-op in sandbox (sandbox uses plain HTTPS, no client cert needed).
 *
 * WHY P12 AND NOT PEM:
 * iOS Security framework requires cert + private key to be imported together
 * via SecPKCS12Import to create a usable SecIdentity. There is no Apple API to
 * construct a SecIdentity from separately stored PEM cert and key — the library's
 * PEM path acknowledges this with a "not implemented" throw that it swallows
 * internally, resulting in a silent status-0 failure on every request.
 */
export async function ensureTellerMtlsConfigured(): Promise<void> {
  const env = getTellerEnvironment()
  if (env === 'sandbox') return
  if (configured) return

  const p12Base64 = await getP12Base64()

  if (!p12Base64 || p12Base64.length < 100) {
    throw new Error('mTLS: teller.p12 asset appears empty or unreadable')
  }

  // configureP12 second param is the keychain service name; third is enableLogging
  await MutualTls.configureP12(P12_KEYCHAIN_SERVICE, false)
  const stored = await MutualTls.storeP12(p12Base64, P12_PASSWORD)

  if (!stored) {
    throw new Error(
      'mTLS: storeP12 returned false — the P12 certificate could not be loaded. ' +
      'Check that teller.p12 was created correctly.',
    )
  }

  configured = true
}

export async function tellerMtlsRequest(
  url: string,
  options: { method: string; headers?: Record<string, string>; body?: string },
): Promise<{ status: number; ok: boolean; text: () => Promise<string>; json: () => Promise<unknown> }> {
  await ensureTellerMtlsConfigured()

  let res: unknown
  try {
    res = await MutualTls.request(url, {
      method: options.method,
      headers: options.headers ?? {},
      body: options.body,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`mTLS request failed: ${msg}`)
  }

  const r = res as Record<string, unknown>
  const status = Number(r.status ?? r.statusCode ?? r.code ?? 0)
  const ok = status >= 200 && status < 300
  const bodyText = String(r.body ?? r.data ?? r.text ?? r.responseBody ?? '')

  if (status === 0) {
    // Reset so the next call re-configures rather than using a broken session
    configured = false
    const detail = bodyText.length > 0 ? ` — ${bodyText.slice(0, 200)}` : ''
    throw new Error(`mTLS: TLS handshake failed (status 0)${detail}. Force-close the app and try again.`)
  }

  return {
    status,
    ok,
    text: async () => bodyText,
    json: async () => {
      try {
        return JSON.parse(bodyText)
      } catch {
        return bodyText
      }
    },
  }
}
