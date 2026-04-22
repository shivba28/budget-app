import { useState } from 'react'
import { Alert, StyleSheet, Text } from 'react-native'
import { useRouter } from 'expo-router'
import * as SecureStore from 'expo-secure-store'

import { useAuthStore } from '@/src/auth/authStore'
import { SECURE } from '@/src/auth/constants'
import { hashPin, isFourDigitPin } from '@/src/auth/pin'
import { BrutalButton, BrutalCard, BrutalScreen } from '@/src/components/Brutalist'
import { PinPad } from '@/src/components/PinPad'
import { tokens } from '@/src/theme/tokens'

export default function SetupPin() {
  const router = useRouter()
  const setHasPinPersisted = useAuthStore((s) => s.setHasPinPersisted)
  const [step, setStep] = useState<'enter' | 'confirm'>('enter')
  const [first, setFirst] = useState('')
  const [second, setSecond] = useState('')
  const [busy, setBusy] = useState(false)

  const active = step === 'enter' ? first : second
  const setActive = step === 'enter' ? setFirst : setSecond

  const onContinue = async () => {
    if (!isFourDigitPin(active)) {
      Alert.alert('PIN', 'Use exactly four digits.')
      return
    }
    if (step === 'enter') {
      setStep('confirm')
      setSecond('')
      return
    }
    if (active !== first) {
      Alert.alert('PIN', 'Pins did not match. Try again.')
      setStep('enter')
      setFirst('')
      setSecond('')
      return
    }
    setBusy(true)
    try {
      const hashed = await hashPin(first)
      await SecureStore.setItemAsync(SECURE.PIN_HASH, hashed)
      setHasPinPersisted(true)
      const { recordUnlockPersisted, unlockSession } = useAuthStore.getState()
      recordUnlockPersisted()
      unlockSession()
      router.replace('/app')
    } catch (e) {
      Alert.alert('PIN', e instanceof Error ? e.message : 'Could not save PIN.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <BrutalScreen
      title="Create PIN"
      subtitle={
        step === 'enter'
          ? 'Choose a 4-digit PIN to unlock the app.'
          : 'Enter the same PIN again to confirm.'
      }
    >
      <BrutalCard>
        <Text style={styles.mono}>
          {step === 'enter' ? 'Step 1 of 2' : 'Step 2 of 2'} —{' '}
          {active.length}/4
        </Text>
        <Text style={styles.dots}>
          {Array.from({ length: 4 }, (_, i) => (i < active.length ? '●' : '○')).join(
            ' ',
          )}
        </Text>
        <PinPad value={active} maxLength={4} onChange={setActive} />
        <BrutalButton
          title={step === 'enter' ? 'Continue' : 'Save PIN'}
          onPress={() => void onContinue()}
          loading={busy}
        />
      </BrutalCard>
    </BrutalScreen>
  )
}

const styles = StyleSheet.create({
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
