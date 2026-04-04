import { createPasskeyCredential, signInWithPasskey } from '@/lib/webauthnClient'
import {
  setAuthToken,
  webAuthnAuthenticateStart,
  webAuthnAuthenticateVerify,
  webAuthnRegisterStart,
  webAuthnRegisterVerify,
} from '@/lib/syncApi'

export async function registerPasskeyFlow(deviceLabel?: string): Promise<void> {
  const options = await webAuthnRegisterStart(
    deviceLabel ? { device: deviceLabel } : undefined,
  )
  const credential = await createPasskeyCredential(options)
  await webAuthnRegisterVerify(credential)
}

export async function unlockWithPasskeyFlow(): Promise<void> {
  const options = await webAuthnAuthenticateStart()
  const credential = await signInWithPasskey(options)
  const result = await webAuthnAuthenticateVerify(credential)
  setAuthToken(result.token)
}
