import { TELLER_API_BASE } from './constants'
import { unwrapAccountList, unwrapTransactionList } from './txMap'
import { getTellerEnvironment } from './connect'
import { tellerMtlsRequest } from './mtls'

export class TellerHttpError extends Error {
  readonly status: number
  readonly bodySnippet: string

  constructor(status: number, message: string, bodySnippet: string) {
    super(message)
    this.name = 'TellerHttpError'
    this.status = status
    this.bodySnippet = bodySnippet
  }

  static async fromResponse(res: Response): Promise<TellerHttpError> {
    const t = await res.text()
    const body = t.slice(0, 500)
    const detail = body.length > 0 ? ` — ${body}` : ''
    return new TellerHttpError(
      res.status,
      `Teller API ${res.status}${res.statusText ? ` ${res.statusText}` : ''}${detail}`,
      body,
    )
  }
}

export function normalizeTellerAccessToken(raw: string | undefined): string {
  if (raw === undefined) return ''
  let t = raw.trim()
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    t = t.slice(1, -1).trim()
  }
  if (/^bearer\s+/i.test(t)) {
    t = t.replace(/^bearer\s+/i, '').trim()
  }
  return t
}

function basicAuthHeader(token: string): string {
  const t = normalizeTellerAccessToken(token)
  const credentials = `${t}:`
  const b64 = globalThis.btoa(credentials)
  return `Basic ${b64}`
}

/** Direct HTTPS to Teller. Sandbox uses standard TLS; dev/prod API access uses client certificates (mTLS) per Teller. */
export async function tellerFetch(
  path: string,
  accessToken: string,
  init?: RequestInit,
): Promise<Response> {
  const url = path.startsWith('http') ? path : `${TELLER_API_BASE}${path.startsWith('/') ? '' : '/'}${path}`
  const headers: Record<string, string> = {
    Accept: 'application/json',
    Authorization: basicAuthHeader(accessToken),
    ...(init?.headers as any),
  }

  // Sandbox works with normal TLS. Development/Production require client cert (mTLS).
  if (getTellerEnvironment() !== 'sandbox') {
    const res = await tellerMtlsRequest(url, {
      method: init?.method ?? 'GET',
      headers,
      body: typeof init?.body === 'string' ? init.body : undefined,
    })
    // Wrap into a minimal Response-like object.
    return {
      ok: res.ok,
      status: res.status,
      statusText: '',
      text: res.text,
      json: res.json as any,
    } as Response
  }

  return fetch(url, {
    ...init,
    headers,
  })
}

export async function tellerGetJson(
  path: string,
  accessToken: string,
): Promise<unknown> {
  const res = await tellerFetch(path, accessToken, { method: 'GET' })
  if (!res.ok) throw await TellerHttpError.fromResponse(res)
  return res.json() as Promise<unknown>
}

export async function fetchAccountsRaw(accessToken: string): Promise<unknown[]> {
  const data = await tellerGetJson('/accounts', accessToken)
  return unwrapAccountList(data)
}

export async function fetchTransactionsPage(
  accountId: string,
  accessToken: string,
  opts?: { count?: number; from_id?: string | null },
): Promise<unknown[]> {
  const q = new URLSearchParams()
  if (opts?.count != null) q.set('count', String(opts.count))
  if (opts?.from_id) q.set('from_id', opts.from_id)
  const qs = q.toString()
  const path = `/accounts/${encodeURIComponent(accountId)}/transactions${qs ? `?${qs}` : ''}`
  const data = await tellerGetJson(path, accessToken)
  return unwrapTransactionList(data)
}
