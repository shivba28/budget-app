/**
 * PrivacyOverlay
 *
 * Renders an opaque cover over the entire screen whenever the app goes
 * 'inactive' or 'background'. This prevents the app switcher (iOS recents /
 * Android overview) from capturing a screenshot of sensitive financial data.
 *
 * Shows the splash screen icon centred on a dark background so the app card
 * in the switcher looks intentional rather than blank.
 *
 * On Android you would normally call FLAG_SECURE via a native module, but this
 * JS-side overlay is effective because RN fires the 'inactive' AppState event
 * before iOS finishes compositing the snapshot — the overlay lands in time.
 */
import { useEffect, useState } from 'react'
import { AppState, Image, StyleSheet, View } from 'react-native'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const SPLASH_ICON = require('../../assets/splash-icon.png') as number

export function PrivacyOverlay() {
  const [covered, setCovered] = useState(false)

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      setCovered(state === 'inactive' || state === 'background')
    })
    return () => sub.remove()
  }, [])

  if (!covered) return null

  return (
    <View style={styles.cover} pointerEvents="none">
      <Image source={SPLASH_ICON} style={styles.icon} resizeMode="contain" />
    </View>
  )
}

const styles = StyleSheet.create({
  cover: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#111111',
    zIndex: 9999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    width: '100%',
    height: '100%',
  },
})
