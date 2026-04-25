import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import * as SecureStore from 'expo-secure-store'

import {
  authenticateWithBiometrics,
  canUseDeviceBiometrics,
  getBiometricUnlockLabel,
} from '@/src/auth/biometrics'
import { useAuthStore } from '@/src/auth/authStore'
import { SECURE } from '@/src/auth/constants'
import { verifyPin } from '@/src/auth/pin'
import { PinPad } from '@/src/components/PinPad'
import { tokens } from '@/src/theme/tokens'

type PinStatus = 'idle' | 'error' | 'success'

export default function UnlockScreen() {
  const router = useRouter()
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<PinStatus>('idle')
  const [statusMsg, setStatusMsg] = useState('')
  const verifyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [locked, setLocked] = useState(false)
  const [bioPending, setBioPending] = useState(false)
  const [bioAvailable, setBioAvailable] = useState(false)
  const [bioLabel, setBioLabel] = useState('Biometrics')
  const shakeX = useRef(new Animated.Value(0)).current
  /** Prefetched so verify doesn’t wait on SecureStore after the 4th digit. */
  const pinHashRef = useRef<string | null | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const h = await SecureStore.getItemAsync(SECURE.PIN_HASH)
        if (!cancelled) pinHashRef.current = h ?? null
      } catch {
        if (!cancelled) pinHashRef.current = null
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    void (async () => {
      if (await canUseDeviceBiometrics()) {
        setBioAvailable(true)
        setBioLabel(await getBiometricUnlockLabel())
      }
    })()
  }, [])

  const completeUnlock = useCallback(() => {
    const { recordUnlockPersisted, unlockSession } = useAuthStore.getState()
    recordUnlockPersisted()
    unlockSession()
    router.replace('/app')
  }, [router])

  const tryUnlockWithBiometrics = useCallback(async () => {
    if (!(await canUseDeviceBiometrics())) return
    setBioPending(true)
    setStatus('idle')
    setStatusMsg('')
    try {
      const ok = await authenticateWithBiometrics()
      if (ok) completeUnlock()
    } finally {
      setBioPending(false)
    }
  }, [completeUnlock])

  /** When this screen is shown (e.g. after inactivity), offer Face ID / Touch ID first; cancel → PIN. */
  useFocusEffect(
    useCallback(() => {
      let cancelled = false
      void (async () => {
        if (!(await canUseDeviceBiometrics())) return
        setBioPending(true)
        setStatus('idle')
        setStatusMsg('')
        const ok = await authenticateWithBiometrics()
        if (cancelled) {
          setBioPending(false)
          return
        }
        setBioPending(false)
        if (ok) completeUnlock()
      })()
      return () => {
        cancelled = true
      }
    }, [completeUnlock]),
  )

  const clearPin = () => {
    setPin('')
    setStatus('idle')
    setStatusMsg('')
    setLocked(false)
  }

  const onSubmitPin = async (candidate: string) => {
    setBusy(true)
    try {
      const hash =
        pinHashRef.current !== undefined
          ? pinHashRef.current
          : await SecureStore.getItemAsync(SECURE.PIN_HASH)
      if (hash) pinHashRef.current = hash
      if (!hash) {
        setStatus('error')
        setStatusMsg('No PIN configured')
        setLocked(false)
        return
      }
      const ok = await verifyPin(candidate, hash)
      if (!ok) {
        setStatus('error')
        setStatusMsg('Incorrect PIN. Try again.')
        // Keep 4 filled dots shown while error state is active (HTML behavior),
        // then reset after a short delay.
        if (resetTimer.current) clearTimeout(resetTimer.current)
        resetTimer.current = setTimeout(() => {
          clearPin()
        }, 1200)

        // Shake dots row (HTML behavior).
        shakeX.setValue(0)
        Animated.sequence([
          Animated.timing(shakeX, { toValue: 6, duration: 60, useNativeDriver: true }),
          Animated.timing(shakeX, { toValue: -6, duration: 60, useNativeDriver: true }),
          Animated.timing(shakeX, { toValue: 5, duration: 60, useNativeDriver: true }),
          Animated.timing(shakeX, { toValue: -5, duration: 60, useNativeDriver: true }),
          Animated.timing(shakeX, { toValue: 4, duration: 60, useNativeDriver: true }),
          Animated.timing(shakeX, { toValue: 0, duration: 60, useNativeDriver: true }),
        ]).start()

        return
      }
      setStatus('success')
      setStatusMsg('Access granted')
      if (resetTimer.current) clearTimeout(resetTimer.current)
      // Brief success state then navigate (was 1400ms — felt sluggish).
      resetTimer.current = setTimeout(() => {
        completeUnlock()
      }, 120)
    } finally {
      setBusy(false)
    }
  }

  // Auto-verify when 4 digits entered (like the HTML mock).
  useEffect(() => {
    if (verifyTimer.current) clearTimeout(verifyTimer.current)
    if (pin.length !== 4) return
    setLocked(true)
    setStatus('idle')
    setStatusMsg('Authenticating…')
    // Run after paint so dots/lock state update; no artificial 180ms wait.
    verifyTimer.current = setTimeout(() => {
      void onSubmitPin(pin)
    }, 0)
    return () => {
      if (verifyTimer.current) clearTimeout(verifyTimer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin])

  const topTitle = useMemo(() => 'Unlock', [])

  const padDisabled = locked || busy || bioPending

  return (
    <View style={styles.wrap}>
      <View style={styles.phone}>
        <View style={styles.topBar}>
          <Text style={styles.topTitle}>{topTitle}</Text>
        </View>

        <View style={styles.body}>
          <Text style={styles.pinLabel}>
            {bioAvailable
              ? `Use ${bioLabel}, or enter your 4-digit PIN`
              : 'Enter your 4-digit PIN'}
          </Text>

          <Animated.View style={[styles.dotsRow, { transform: [{ translateX: shakeX }] }]}>
            {Array.from({ length: 4 }, (_, i) => {
              const filled = i < pin.length
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
            value={pin}
            maxLength={4}
            disabled={padDisabled}
            onChange={(next) => {
              if (padDisabled) return
              setStatus('idle')
              setStatusMsg('')
              setPin(next)
            }}
          />

          {bioAvailable ? (
            <Pressable
              onPress={() => void tryUnlockWithBiometrics()}
              disabled={bioPending}
              style={({ pressed }) => [styles.bioLink, bioPending && styles.bioLinkDisabled, pressed && !bioPending && { opacity: 0.75 }]}
            >
              <Text style={styles.bioLinkText}>
                {bioPending ? `${bioLabel}…` : `Use ${bioLabel}`}
              </Text>
            </Pressable>
          ) : null}
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
  bioLink: {
    marginTop: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  bioLinkDisabled: {
    opacity: 0.55,
  },
  bioLinkText: {
    fontFamily: tokens.font.mono,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: tokens.color.border,
    textDecorationLine: 'underline',
    textAlign: 'center',
  },
})
