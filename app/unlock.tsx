import { useEffect, useState } from 'react'
import { Alert, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import * as SecureStore from 'expo-secure-store'

import { useAuthStore } from '@/src/auth/authStore'
import {
  authenticateWithBiometrics,
  canUseDeviceBiometrics,
  getBiometricUnlockLabel,
} from '@/src/auth/biometrics'
import { SECURE } from '@/src/auth/constants'
import { verifyPin } from '@/src/auth/pin'
import { BrutalButton, BrutalCard, BrutalScreen } from '@/src/components/Brutalist'
import { PinPad } from '@/src/components/PinPad'
import { tokens } from '@/src/theme/tokens'

export default function UnlockScreen() {
  const router = useRouter()
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [bioAvailable, setBioAvailable] = useState(false)
  const [bioLabel, setBioLabel] = useState('Biometrics')

  useEffect(() => {
    void (async () => {
      const ok = await canUseDeviceBiometrics()
      setBioAvailable(ok)
      if (ok) setBioLabel(await getBiometricUnlockLabel())
    })()
  }, [])

  const completeUnlock = () => {
    const { recordUnlockPersisted, unlockSession } = useAuthStore.getState()
    recordUnlockPersisted()
    unlockSession()
    router.replace('/app')
  }

  const onBiometrics = async () => {
    setBusy(true)
    try {
      const ok = await authenticateWithBiometrics()
      if (!ok) return
      completeUnlock()
    } finally {
      setBusy(false)
    }
  }

  const onSubmitPin = async () => {
    if (pin.length !== 4) {
      Alert.alert('PIN', 'Enter your 4-digit PIN.')
      return
    }
    setBusy(true)
    try {
      const hash = await SecureStore.getItemAsync(SECURE.PIN_HASH)
      if (!hash) {
        Alert.alert('PIN', 'No PIN is configured.')
        return
      }
      const ok = await verifyPin(pin, hash)
      if (!ok) {
        Alert.alert('PIN', 'Incorrect PIN.')
        setPin('')
        return
      }
      completeUnlock()
    } finally {
      setBusy(false)
    }
  }

  return (
    <BrutalScreen
      title="Unlock"
      subtitle="Use Face ID / Touch ID when available, or enter your PIN."
    >
      <BrutalCard>
        {bioAvailable ? (
          <>
            <BrutalButton
              title={`Unlock with ${bioLabel}`}
              onPress={() => void onBiometrics()}
              loading={busy}
            />
            <Text style={styles.divider}>or use PIN</Text>
          </>
        ) : null}
        <Text style={styles.mono}>{pin.length}/4</Text>
        <Text style={styles.dots}>
          {Array.from({ length: 4 }, (_, i) => (i < pin.length ? '●' : '○')).join(
            ' ',
          )}
        </Text>
        <PinPad value={pin} maxLength={4} onChange={setPin} />
        <BrutalButton
          title="Unlock with PIN"
          variant={bioAvailable ? 'neutral' : 'accent'}
          onPress={() => void onSubmitPin()}
          loading={busy}
        />
      </BrutalCard>
    </BrutalScreen>
  )
}

const styles = StyleSheet.create({
  divider: {
    textAlign: 'center',
    textTransform: 'uppercase',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    color: tokens.color.fg,
    opacity: 0.65,
    marginVertical: tokens.space[4],
  },
  mono: {
    fontFamily: tokens.font.mono,
    color: tokens.color.fg,
    marginBottom: tokens.space[2],
    fontSize: 13,
  },
  dots: {
    fontFamily: tokens.font.mono,
    fontSize: 22,
    letterSpacing: 6,
    color: tokens.color.fg,
    marginBottom: tokens.space[5],
    textAlign: 'center',
  },
})
