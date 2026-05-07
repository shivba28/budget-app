import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Animated, Pressable, StyleSheet, Text, View } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import * as SecureStore from 'expo-secure-store'

import {
  authenticateWithBiometrics,
  canUseDeviceBiometrics,
  getBiometricUnlockLabel,
} from '@/src/auth/biometrics'
import { useAuthStore } from '@/src/auth/authStore'
import { SECURE, PIN_LOCKOUT_DURATIONS_MS, PIN_MAX_ATTEMPTS } from '@/src/auth/constants'
import { verifyPin } from '@/src/auth/pin'
import { PinPad } from '@/src/components/PinPad'
import { tokens } from '@/src/theme/tokens'

type PinStatus = 'idle' | 'error' | 'success' | 'locked'

// ─── Lockout helpers ──────────────────────────────────────────────────────────

async function getFailCount(): Promise<number> {
  try {
    const raw = await SecureStore.getItemAsync(SECURE.PIN_FAIL_COUNT)
    const n = Number(raw)
    return Number.isFinite(n) && n >= 0 ? n : 0
  } catch {
    return 0
  }
}

async function setFailCount(n: number): Promise<void> {
  await SecureStore.setItemAsync(SECURE.PIN_FAIL_COUNT, String(n))
}

async function clearLockout(): Promise<void> {
  await SecureStore.deleteItemAsync(SECURE.PIN_FAIL_COUNT).catch(() => {})
  await SecureStore.deleteItemAsync(SECURE.PIN_LOCKOUT_UNTIL).catch(() => {})
}

async function getLockoutUntil(): Promise<number> {
  try {
    const raw = await SecureStore.getItemAsync(SECURE.PIN_LOCKOUT_UNTIL)
    const n = Number(raw)
    return Number.isFinite(n) ? n : 0
  } catch {
    return 0
  }
}

async function setLockoutUntil(ms: number): Promise<void> {
  await SecureStore.setItemAsync(SECURE.PIN_LOCKOUT_UNTIL, String(ms))
}

function formatSeconds(ms: number): string {
  const s = Math.ceil(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.ceil(s / 60)
  if (m < 60) return `${m}m`
  return `${Math.ceil(m / 60)}h`
}

// ─────────────────────────────────────────────────────────────────────────────

export default function UnlockScreen() {
  const router = useRouter()
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<PinStatus>('idle')
  const [statusMsg, setStatusMsg] = useState('')
  const [locked, setLocked] = useState(false)
  const [bioPending, setBioPending] = useState(false)
  const [bioAvailable, setBioAvailable] = useState(false)
  const [bioLabel, setBioLabel] = useState('Biometrics')
  const shakeX = useRef(new Animated.Value(0)).current
  const verifyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lockCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pinHashRef = useRef<string | null | undefined>(undefined)

  // ── Prefetch PIN hash ───────────────────────────────────────────────────────
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
    return () => { cancelled = true }
  }, [])

  // ── Biometrics availability ─────────────────────────────────────────────────
  useEffect(() => {
    void (async () => {
      if (await canUseDeviceBiometrics()) {
        setBioAvailable(true)
        setBioLabel(await getBiometricUnlockLabel())
      }
    })()
  }, [])

  // ── Lockout countdown ───────────────────────────────────────────────────────
  const startLockCountdown = useCallback((initialMs: number) => {
    setStatus('locked')
    setStatusMsg(`Locked — wait ${formatSeconds(initialMs)}`)
    if (lockCountdownRef.current) clearInterval(lockCountdownRef.current)
    lockCountdownRef.current = setInterval(() => {
      void getLockoutUntil().then((until) => {
        const r = until - Date.now()
        if (r <= 0) {
          if (lockCountdownRef.current) clearInterval(lockCountdownRef.current)
          setStatus('idle')
          setStatusMsg('')
        } else {
          setStatusMsg(`Locked — wait ${formatSeconds(r)}`)
        }
      })
    }, 1000)
  }, [])

  useEffect(() => () => {
    if (lockCountdownRef.current) clearInterval(lockCountdownRef.current)
  }, [])

  // Check lockout on mount
  useEffect(() => {
    void getLockoutUntil().then((until) => {
      const remaining = until - Date.now()
      if (remaining > 0) startLockCountdown(remaining)
    })
  }, [startLockCountdown])

  // ── Complete unlock ─────────────────────────────────────────────────────────
  const completeUnlock = useCallback(() => {
    const { recordUnlockPersisted, unlockSession } = useAuthStore.getState()
    recordUnlockPersisted()
    unlockSession()
    void clearLockout()
    router.replace('/app')
  }, [router])

  // ── Biometrics ──────────────────────────────────────────────────────────────
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

  useFocusEffect(
    useCallback(() => {
      let cancelled = false
      void (async () => {
        const until = await getLockoutUntil()
        if (until > Date.now()) return // don't offer bio while locked out
        if (!(await canUseDeviceBiometrics())) return
        setBioPending(true)
        setStatus('idle')
        setStatusMsg('')
        const ok = await authenticateWithBiometrics()
        if (cancelled) { setBioPending(false); return }
        setBioPending(false)
        if (ok) completeUnlock()
      })()
      return () => { cancelled = true }
    }, [completeUnlock]),
  )

  // ── Shake animation ─────────────────────────────────────────────────────────
  const shake = useCallback(() => {
    shakeX.setValue(0)
    Animated.sequence([
      Animated.timing(shakeX, { toValue: 6, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: -6, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: 5, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: -5, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: 4, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start()
  }, [shakeX])

  const clearPin = useCallback(() => {
    setPin('')
    setStatus('idle')
    setStatusMsg('')
    setLocked(false)
  }, [])

  // ── PIN submission ──────────────────────────────────────────────────────────
  const onSubmitPin = useCallback(async (candidate: string) => {
    // Re-check lockout right before attempting
    const until = await getLockoutUntil()
    if (until > Date.now()) {
      startLockCountdown(until - Date.now())
      setPin('')
      setLocked(false)
      return
    }

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

      if (ok) {
        await clearLockout()
        setStatus('success')
        setStatusMsg('Access granted')
        if (resetTimer.current) clearTimeout(resetTimer.current)
        resetTimer.current = setTimeout(() => completeUnlock(), 120)
        return
      }

      // ── Failed attempt ────────────────────────────────────────────────────
      const prevCount = await getFailCount()
      const newCount = prevCount + 1
      await setFailCount(newCount)
      shake()

      if (newCount >= PIN_MAX_ATTEMPTS) {
        setStatus('error')
        setStatusMsg('Too many attempts')
        if (resetTimer.current) clearTimeout(resetTimer.current)
        resetTimer.current = setTimeout(() => {
          Alert.alert(
            'Too Many Attempts',
            'You have reached the maximum number of PIN attempts. All data will be erased to protect your account.',
            [
              {
                text: 'Erase All Data',
                style: 'destructive',
                onPress: async () => {
                  await useAuthStore.getState().clearAllData()
                  await clearLockout()
                  router.replace('/setup-pin')
                },
              },
            ],
            { cancelable: false },
          )
        }, 400)
        return
      }

      // Exponential backoff starting at 5th failure
      const lockoutIndex = newCount - 5
      if (lockoutIndex >= 0) {
        const durationMs =
          PIN_LOCKOUT_DURATIONS_MS[Math.min(lockoutIndex, PIN_LOCKOUT_DURATIONS_MS.length - 1)] ??
          3_600_000
        await setLockoutUntil(Date.now() + durationMs)
        setStatus('error')
        setStatusMsg('Incorrect PIN')
        if (resetTimer.current) clearTimeout(resetTimer.current)
        resetTimer.current = setTimeout(() => {
          clearPin()
          startLockCountdown(durationMs)
        }, 800)
      } else {
        const remaining = PIN_MAX_ATTEMPTS - newCount
        setStatus('error')
        setStatusMsg(
          `Incorrect PIN — ${remaining} attempt${remaining === 1 ? '' : 's'} left`,
        )
        if (resetTimer.current) clearTimeout(resetTimer.current)
        resetTimer.current = setTimeout(() => clearPin(), 1200)
      }
    } finally {
      setBusy(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completeUnlock, shake, clearPin, startLockCountdown, router])

  // Auto-verify when 4 digits entered
  useEffect(() => {
    if (verifyTimer.current) clearTimeout(verifyTimer.current)
    if (pin.length !== 4) return
    setLocked(true)
    if (status !== 'locked') { setStatus('idle'); setStatusMsg('Authenticating…') }
    verifyTimer.current = setTimeout(() => void onSubmitPin(pin), 0)
    return () => { if (verifyTimer.current) clearTimeout(verifyTimer.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin])

  // ── Forgot PIN ──────────────────────────────────────────────────────────────
  const onForgotPin = useCallback(() => {
    Alert.alert(
      'Forgot your PIN?',
      'There is no way to recover a forgotten PIN. Your only option is to erase all app data and set a new PIN.\n\nThis cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Erase All Data',
          style: 'destructive',
          onPress: async () => {
            await useAuthStore.getState().clearAllData()
            await clearLockout()
            router.replace('/setup-pin')
          },
        },
      ],
    )
  }, [router])

  const isLockedOut = status === 'locked'
  const padDisabled = locked || busy || bioPending || isLockedOut

  return (
    <View style={styles.wrap}>
      <View style={styles.phone}>
        <View style={styles.topBar}>
          <Text style={styles.topTitle}>Unlock</Text>
        </View>

        <View style={styles.body}>
          <Text style={styles.pinLabel}>
            {isLockedOut
              ? 'Too many failed attempts'
              : bioAvailable
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
                    : status === 'locked'
                      ? styles.dotLocked
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
              status === 'locked' && styles.statusLocked,
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

          {bioAvailable && !isLockedOut ? (
            <Pressable
              onPress={() => void tryUnlockWithBiometrics()}
              disabled={bioPending}
              style={({ pressed }) => [pressed && !bioPending && { opacity: 0.9 }]}
            >
              {({ pressed }) => (
                <View
                  style={[
                    styles.bioBtn,
                    bioPending && styles.bioBtnDisabled,
                    pressed && !bioPending && styles.bioBtnPressed,
                  ]}
                  pointerEvents="none"
                >
                  <Text style={styles.bioBtnText}>
                    {bioPending ? `${bioLabel}…` : `Use ${bioLabel}`}
                  </Text>
                </View>
              )}
            </Pressable>
          ) : null}

          <Pressable onPress={onForgotPin} style={styles.forgotBtn}>
            <Text style={styles.forgotText}>Forgot PIN? (erases all data)</Text>
          </Pressable>
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
  dotLocked: {
    backgroundColor: '#F5C842',
    borderColor: '#F5C842',
  },
  statusMsg: {
    fontFamily: tokens.font.mono,
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    height: 16,
    color: 'rgba(17,17,17,0.55)',
    marginTop: 4,
    textAlign: 'center',
  },
  statusError: { color: tokens.color.debit },
  statusSuccess: { color: '#3B6D11' },
  statusLocked: { color: '#B8860B' },
  bioBtn: {
    marginTop: 6,
    borderWidth: tokens.border.w3,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.card,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
    shadowColor: tokens.color.border,
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
    minWidth: 220,
  },
  bioBtnPressed: {
    transform: [{ translateX: 3 }, { translateY: 3 }],
    shadowOpacity: 0,
    elevation: 0,
  },
  bioBtnDisabled: { opacity: 0.55 },
  bioBtnText: {
    fontFamily: tokens.font.mono,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: tokens.color.border,
    textAlign: 'center',
  },
  forgotBtn: {
    marginTop: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  forgotText: {
    fontFamily: tokens.font.mono,
    fontSize: 10,
    color: 'rgba(17,17,17,0.4)',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
})
