/* googleapis package typings are not resolved cleanly with this tsconfig; keep compile green. */
declare module 'googleapis' {
  import type { OAuth2Client } from 'google-auth-library'

  type DriveV3 = {
    files: {
      list(
        params: Record<string, unknown>,
      ): Promise<{ data: { files?: { id?: string }[] } }>
      get(
        params: Record<string, unknown>,
        opts?: Record<string, unknown>,
      ): Promise<{ data: string | Record<string, unknown> }>
      create(
        params: Record<string, unknown>,
      ): Promise<{ data: { id?: string } }>
      update(params: Record<string, unknown>): Promise<unknown>
    }
  }

  export const google: {
    drive: (opts: { version: 'v3'; auth: OAuth2Client }) => DriveV3
    oauth2: (opts: { version: string; auth: OAuth2Client }) => {
      userinfo: { get: () => Promise<{ data: { email?: string; id?: string } }> }
    }
  }
}
