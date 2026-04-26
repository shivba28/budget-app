import { useState } from 'react'
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useTripsStore } from '@/src/stores/tripsStore'

const CREAM = '#FAFAF5'
const INK = '#111111'
const YELLOW = '#F5C842'
const MONO = Platform.select({ ios: 'Courier New', android: 'monospace', default: 'monospace' })

export default function TripNewScreen() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const add = useTripsStore((s) => s.add)
  const [name, setName] = useState('')

  const onCreate = () => {
    const n = name.trim()
    if (!n) return
    const id = add({ name: n })
    router.replace(`/app/(tabs)/trips/${id}`)
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.topbar, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => pressed && { opacity: 0.7 }}>
          <View style={styles.backBtn}>
            <Text style={styles.backChev}>‹</Text>
          </View>
        </Pressable>
        <Text style={styles.topbarTitle}>New trip / event</Text>
        <Text style={styles.topbarSub}>Name your getaway or occasion</Text>
      </View>
      <View style={[styles.body, { paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.card}>
          <Text style={styles.fieldLabel}>Trip or event name</Text>
          <TextInput
            style={styles.fieldInput}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Iceland 2026"
            placeholderTextColor="#999"
            autoFocus
            autoCorrect={false}
          />
          <Pressable onPress={onCreate}>
            {({ pressed }) => (
              <View style={[styles.btn, styles.btnYellow, pressed && styles.btnPressed]} pointerEvents="none">
                <Text style={styles.btnText}>Create</Text>
              </View>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: CREAM },
  topbar: {
    backgroundColor: INK,
    paddingHorizontal: 14,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backBtn: {
    width: 22,
    height: 22,
    borderWidth: 2,
    borderColor: CREAM,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backChev: {
    fontFamily: MONO,
    fontSize: 18,
    fontWeight: '900',
    color: CREAM,
    lineHeight: 22,
  },
  topbarTitle: {
    fontFamily: MONO,
    fontSize: 18,
    fontWeight: '800',
    color: CREAM,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    flexShrink: 1,
    minWidth: 0,
  },
  topbarSub: {
    fontFamily: MONO,
    fontSize: 12,
    color: '#888888',
    flexShrink: 0,
    marginLeft: 'auto',
  },
  body: { padding: 12 },
  card: {
    borderWidth: 3,
    borderColor: INK,
    backgroundColor: CREAM,
    padding: 12,
    shadowColor: INK,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
  fieldLabel: {
    fontFamily: MONO,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: INK,
    marginBottom: 4,
  },
  fieldInput: {
    borderWidth: 2,
    borderColor: INK,
    backgroundColor: CREAM,
    paddingHorizontal: 9,
    paddingVertical: 7,
    fontFamily: MONO,
    fontSize: 14,
    color: INK,
    marginBottom: 10,
  },
  btn: {
    borderWidth: 3,
    borderColor: INK,
    paddingVertical: 10,
    alignItems: 'center',
    shadowColor: INK,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
  btnYellow: { backgroundColor: YELLOW },
  btnPressed: { transform: [{ translateX: 3 }, { translateY: 3 }], shadowOpacity: 0, elevation: 0 },
  btnText: {
    fontFamily: MONO,
    fontSize: 13,
    fontWeight: '800',
    color: INK,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
})
