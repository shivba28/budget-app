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
import { useSavingsGoalsStore } from '@/src/stores/savingsGoalsStore'

const CREAM = '#FAFAF5'
const INK = '#111111'
const YELLOW = '#F5C842'
const MONO = Platform.select({ ios: 'Courier New', android: 'monospace', default: 'monospace' })

const GOAL_COLORS = [
  '#F5C842', '#3BCEAC', '#6A4C93', '#457B9D',
  '#E76F51', '#2A9D8F', '#B5179E', '#06D6A0',
]

type Props = {
  onCreated?: (id: number) => void
  onDismiss?: () => void
}

export const SavingsGoalBottomSheet = forwardRef<BottomSheetModal, Props>(
  function SavingsGoalBottomSheet({ onCreated, onDismiss }, ref) {
    const add = useSavingsGoalsStore((s) => s.add)

    const [name, setName] = useState('')
    const [target, setTarget] = useState('')
    const [saved, setSaved] = useState('')
    const [targetDate, setTargetDate] = useState('')
    const [color, setColor] = useState<string | null>(GOAL_COLORS[0]!)
    const [notes, setNotes] = useState('')

    const snapPoints = useMemo(() => ['85%'], [])

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.45} />
      ),
      [],
    )

    const reset = () => {
      setName('')
      setTarget('')
      setSaved('')
      setTargetDate('')
      setColor(GOAL_COLORS[0]!)
      setNotes('')
    }

    const canSave = name.trim() !== '' && Number(target) > 0

    const onCreate = () => {
      if (!canSave) return
      const id = add({
        name: name.trim(),
        target_amount: Number(target),
        current_amount: saved.trim() ? Number(saved) : 0,
        target_date: targetDate.trim() || null,
        color,
        notes: notes.trim() || null,
      })
      reset()
      ;(ref as React.RefObject<BottomSheetModal>)?.current?.dismiss()
      onCreated?.(id)
    }

    const handleDismiss = () => {
      reset()
      onDismiss?.()
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
          <Text style={styles.title}>New savings goal</Text>

          <Text style={styles.fieldLabel}>Goal name</Text>
          <BottomSheetTextInput
            style={styles.fieldInput}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Emergency fund…"
            placeholderTextColor="#999"
            autoCorrect={false}
            autoCapitalize="words"
          />

          <Text style={styles.fieldLabel}>Target amount ($)</Text>
          <BottomSheetTextInput
            style={styles.fieldInput}
            value={target}
            onChangeText={setTarget}
            keyboardType="decimal-pad"
            placeholder="e.g. 5000"
            placeholderTextColor="#999"
          />

          <Text style={styles.fieldLabel}>Already saved ($) (optional)</Text>
          <BottomSheetTextInput
            style={styles.fieldInput}
            value={saved}
            onChangeText={setSaved}
            keyboardType="decimal-pad"
            placeholder="e.g. 1200"
            placeholderTextColor="#999"
          />

          <Text style={styles.fieldLabel}>Target date (optional)</Text>
          <DateInput value={targetDate} onChange={setTargetDate} style={styles.fieldInput} />

          <Text style={styles.fieldLabel}>Color</Text>
          <View style={styles.colorRow}>
            {GOAL_COLORS.map((c) => (
              <Pressable key={c} onPress={() => setColor(c)}>
                <View
                  style={[
                    styles.colorDot,
                    { backgroundColor: c },
                    color === c && styles.colorDotSelected,
                  ]}
                  pointerEvents="none"
                />
              </Pressable>
            ))}
          </View>

          <Text style={styles.fieldLabel}>Notes (optional)</Text>
          <BottomSheetTextInput
            style={[styles.fieldInput, styles.notesInput]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Why this goal matters…"
            placeholderTextColor="#999"
            multiline
            numberOfLines={2}
          />

          <Pressable onPress={onCreate} disabled={!canSave}>
            {({ pressed }) => (
              <View
                style={[
                  styles.btn,
                  styles.btnYellow,
                  !canSave && styles.btnDisabled,
                  pressed && canSave && styles.btnPressed,
                ]}
                pointerEvents="none"
              >
                <Text style={styles.btnText}>Create goal</Text>
              </View>
            )}
          </Pressable>
        </BottomSheetScrollView>
      </BottomSheetModal>
    )
  },
)

const styles = StyleSheet.create({
  sheetBg: { backgroundColor: CREAM, borderWidth: 3, borderColor: INK },
  handle: { backgroundColor: INK, width: 48 },
  scroll: { paddingHorizontal: 14, paddingTop: 8, paddingBottom: 48 },
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
    marginTop: 10,
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
  },
  notesInput: { minHeight: 52, textAlignVertical: 'top' },
  colorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 4,
  },
  colorDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorDotSelected: {
    borderColor: INK,
    borderWidth: 3,
    transform: [{ scale: 1.15 }],
  },
  btn: {
    borderWidth: 3,
    borderColor: INK,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 20,
    shadowColor: INK,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
  btnYellow: { backgroundColor: YELLOW },
  btnDisabled: { opacity: 0.4 },
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
