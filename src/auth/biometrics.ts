import * as LocalAuthentication from 'expo-local-authentication'

export async function canUseDeviceBiometrics(): Promise<boolean> {
  const compatible = await LocalAuthentication.hasHardwareAsync()
  if (!compatible) return false
  return await LocalAuthentication.isEnrolledAsync()
}

/** Short label for the primary enrolled method (Face ID, Touch ID, etc.). */
export async function getBiometricUnlockLabel(): Promise<string> {
  const types = await LocalAuthentication.supportedAuthenticationTypesAsync()
  if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
    return 'Face ID'
  }
  if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
    return 'Touch ID'
  }
  if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
    return 'Iris'
  }
  return 'Biometrics'
}

/**
 * Prompts the system biometric sheet (Face ID / Touch ID / device credential where allowed).
 * Success means the same device owner gate as typical banking “quick unlock” — not a PIN proof.
 */
export async function authenticateWithBiometrics(): Promise<boolean> {
  const res = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Unlock Budget Tracker',
    cancelLabel: 'Use PIN',
    disableDeviceFallback: false,
  })
  return res.success
}
