import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet'
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetTextInput,
} from '@gorhom/bottom-sheet'
import { forwardRef, useCallback, useMemo, useState } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'

import { DateInput } from '@/src/components/DateInput'
import { useTripsStore } from '@/src/stores/tripsStore'

const CREAM = '#FAFAF5'
const INK = '#111111'
const YELLOW = '#F5C842'
const MONO = Platform.select({ ios: 'Courier New', android: 'monospace', default: 'monospace' })

type Props = {
  onCreated: (id: number) => void
  onDismiss: () => void
}

export const TripNewBottomSheet = forwardRef<BottomSheetModal, Props>(
  function TripNewBottomSheet({ onCreated, onDismiss }, ref) {
    const add = useTripsStore((s) => s.add)
    const [name, setName] = useState('')
    const [budget, setBudget] = useState('')
    const [start, setStart] = useState('')
    const [end, setEnd] = useState('')

    const snapPoints = useMemo(() => ['72%'], [])

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop
          {...props}
          appearsOnIndex={0}
          disappearsOnIndex={-1}
          opacity={0.45}
        />
      ),
      [],
    )

    const onCreate = () => {
      const n = name.trim()
      if (!n) return
      const lim = budget.trim() === '' ? null : Number(budget)
      const id = add({
        name: n,
        start_date: start.trim() || null,
        end_date: end.trim() || null,
        budget_limit: lim !== null && !Number.isNaN(lim) ? lim : null,
      })
      setName('')
      setBudget('')
      setStart('')
      setEnd('')
      ;(ref as React.RefObject<BottomSheetModal>)?.current?.dismiss()
      onCreated(id)
    }

    const handleDismiss = () => {
      setName('')
      setBudget('')
      setStart('')
      setEnd('')
      onDismiss()
    }

    return (
      <BottomSheetModal
        ref={ref}
        snapPoints={snapPoints}
        enablePanDownToClose
        onDismiss={handleDismiss}
        backdropComponent={renderBackdrop}
        backgroundStyle={styles.sheetBg}
        handleIndicatorStyle={styles.handle}
      >
        <BottomSheetScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>New trip</Text>
          <Text style={styles.fieldLabel}>Trip name</Text>
          <BottomSheetTextInput
            style={styles.fieldInput}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Iceland 2026…"
            placeholderTextColor="#999"
            autoCorrect={false}
            autoCapitalize="words"
          />
          <Text style={styles.fieldLabel}>Budget cap (optional)</Text>
          <BottomSheetTextInput
            style={styles.fieldInput}
            value={budget}
            onChangeText={setBudget}
            keyboardType="decimal-pad"
            placeholder="e.g. 3200"
            placeholderTextColor="#999"
          />
          <Text style={styles.fieldLabel}>Start date (optional)</Text>
          <DateInput value={start} onChange={setStart} style={styles.dateField} />
          <Text style={styles.fieldLabel}>End date (optional)</Text>
          <DateInput
            value={end}
            onChange={setEnd}
            style={[styles.dateField, { marginBottom: 14 }]}
          />
          <Pressable onPress={onCreate}>
            {({ pressed }) => (
              <View style={[styles.btn, styles.btnYellow, pressed && styles.btnPressed]} pointerEvents="none">
                <Text style={styles.btnText}>Create trip</Text>
              </View>
            )}
          </Pressable>
        </BottomSheetScrollView>
      </BottomSheetModal>
    )
  },
)

const styles = StyleSheet.create({
  sheetBg: {
    backgroundColor: CREAM,
    borderWidth: 3,
    borderColor: INK,
  },
  handle: {
    backgroundColor: INK,
    width: 48,
  },
  scroll: {
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 48,
  },
  title: {
    fontFamily: MONO,
    fontSize: 16,
    fontWeight: '800',
    color: INK,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 16,
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
    marginBottom: 14,
  },
  dateField: {
    marginBottom: 4,
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
