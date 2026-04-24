import { useEffect, useRef, useState } from 'react'
import { Animated, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import * as SecureStore from 'expo-secure-store'

import { useAuthStore } from '@/src/auth/authStore'
import { SECURE } from '@/src/auth/constants'
import { hashPin } from '@/src/auth/pin'
import { PinPad } from '@/src/components/PinPad'
import { tokens } from '@/src/theme/tokens'

type PinStatus = 'idle' | 'error' | 'success'

export default function SetupPin() {
  const router = useRouter()
  const setHasPinPersisted = useAuthStore((s) => s.setHasPinPersisted)

  const [step, setStep] = useState<'enter' | 'confirm'>('enter')
  const [first, setFirst] = useState('')
  const [second, setSecond] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<PinStatus>('idle')
  const [statusMsg, setStatusMsg] = useState('')
  const [locked, setLocked] = useState(false)
  const shakeX = useRef(new Animated.Value(0)).current
  const stepTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const active = step === 'enter' ? first : second
  const setActive = step === 'enter' ? setFirst : setSecond

  const shake = () => {
    shakeX.setValue(0)
    Animated.sequence([
      Animated.timing(shakeX, { toValue: 6, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: -6, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: 5, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: -5, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: 4, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start()
  }

  const savePinAndFinish = async (pin: string) => {
    setBusy(true)
    try {
      const hashed = await hashPin(pin)
      await SecureStore.setItemAsync(SECURE.PIN_HASH, hashed)
      setHasPinPersisted(true)
      setStatus('success')
      setStatusMsg('PIN saved!')
      const { recordUnlockPersisted, unlockSession } = useAuthStore.getState()
      recordUnlockPersisted()
      unlockSession()
      stepTimer.current = setTimeout(() => router.replace('/app'), 900)
    } catch (e) {
      setStatus('error')
      setStatusMsg(e instanceof Error ? e.message : 'Could not save PIN.')
      setLocked(false)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (stepTimer.current) clearTimeout(stepTimer.current)
    if (active.length !== 4) return

    setLocked(true)

    if (step === 'enter') {
      setStatusMsg('Now confirm your PIN')
      stepTimer.current = setTimeout(() => {
        setStep('confirm')
        setSecond('')
        setStatus('idle')
        setStatusMsg('')
        setLocked(false)
      }, 600)
    } else {
      setStatusMsg('Verifying…')
      stepTimer.current = setTimeout(() => {
        if (second !== first) {
          setStatus('error')
          setStatusMsg("PINs didn't match. Try again.")
          shake()
          stepTimer.current = setTimeout(() => {
            setStep('enter')
            setFirst('')
            setSecond('')
            setStatus('idle')
            setStatusMsg('')
            setLocked(false)
          }, 1200)
        } else {
          void savePinAndFinish(first)
        }
      }, 180)
    }

    return () => {
      if (stepTimer.current) clearTimeout(stepTimer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  const topTitle = step === 'enter' ? 'Create PIN' : 'Confirm PIN'
  const pinLabel = step === 'enter' ? 'Choose a 4-digit PIN' : 'Enter your PIN again'

  return (
    <View style={styles.wrap}>
      <View style={styles.phone}>
        <View style={styles.topBar}>
          <Text style={styles.topTitle}>{topTitle}</Text>
        </View>

        <View style={styles.body}>
          <Text style={styles.pinLabel}>{pinLabel}</Text>

          <Animated.View style={[styles.dotsRow, { transform: [{ translateX: shakeX }] }]}>
            {Array.from({ length: 4 }, (_, i) => {
              const filled = i < active.length
              const dotStyle =
                status === 'error'
                  ? styles.dotError
                  : status === 'success'
                    ? styles.dotSuccess
                    : filled
                      ? styles.dotFilled
                      : null
              return <View key={i} style={[styles.dot, dotStyle]} />
            })}
          </Animated.View>

          <Text
            style={[
              styles.statusMsg,
              status === 'error' && styles.statusError,
              status === 'success' && styles.statusSuccess,
            ]}
          >
            {statusMsg || ' '}
          </Text>

          <PinPad
            value={active}
            maxLength={4}
            disabled={locked || busy}
            onChange={(next) => {
              if (locked || busy) return
              setStatus('idle')
              setStatusMsg('')
              setActive(next)
            }}
          />
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: tokens.color.accent,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  phone: {
    width: 320,
    backgroundColor: tokens.color.card,
    borderWidth: tokens.border.w3,
    borderColor: tokens.color.border,
    borderRadius: 0,
    shadowColor: tokens.color.border,
    shadowOffset: { width: 6, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 0,
    overflow: 'hidden',
  },
  topBar: {
    backgroundColor: tokens.color.border,
    paddingVertical: 14,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: {
    fontFamily: tokens.font.mono,
    fontSize: 13,
    fontWeight: '500',
    color: tokens.color.card,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  body: {
    paddingTop: 32,
    paddingHorizontal: 24,
    paddingBottom: 24,
    alignItems: 'center',
    gap: 16,
    backgroundColor: tokens.color.card,
  },
  pinLabel: {
    fontFamily: tokens.font.mono,
    fontSize: 12,
    color: 'rgba(17,17,17,0.65)',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  dot: {
    width: 20,
    height: 20,
    borderWidth: tokens.border.w3,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.card,
    borderRadius: 0,
  },
  dotFilled: {
    backgroundColor: tokens.color.border,
    transform: [{ scale: 1.08 }],
  },
  dotError: {
    backgroundColor: tokens.color.debit,
    borderColor: tokens.color.debit,
  },
  dotSuccess: {
    backgroundColor: '#3B6D11',
    borderColor: '#3B6D11',
  },
  statusMsg: {
    fontFamily: tokens.font.mono,
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    height: 16,
    color: 'rgba(17,17,17,0.55)',
    marginTop: 4,
  },
  statusError: { color: tokens.color.debit },
  statusSuccess: { color: '#3B6D11' },
})
