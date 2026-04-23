import DateTimePicker from '@react-native-community/datetimepicker'
import { useState } from 'react'
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native'

const CREAM = '#FAFAF5'
const INK = '#111111'
const YELLOW = '#F5C842'
const MONO = Platform.select({ ios: 'Courier New', android: 'monospace', default: 'monospace' })

function parseDate(value: string): Date {
  const d = new Date(value + 'T00:00:00')
  return isNaN(d.getTime()) ? new Date() : d
}

function toYMD(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

type Props = {
  value: string           // YYYY-MM-DD
  onChange: (v: string) => void
  placeholder?: string
  style?: object
}

export function DateInput({ value, onChange, placeholder = 'YYYY-MM-DD', style }: Props) {
  const [open, setOpen] = useState(false)
  const date = parseDate(value)

  // iOS: inline spinner inside a modal
  // Android: native dialog, no modal needed
  const onAndroidChange = (_: unknown, selected?: Date) => {
    setOpen(false)
    if (selected) onChange(toYMD(selected))
  }

  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={[styles.field, style]}>
        <Text style={[styles.text, !value && styles.placeholder]}>
          {value || placeholder}
        </Text>
      </Pressable>

      {Platform.OS === 'android' && open && (
        <DateTimePicker
          value={date}
          mode="date"
          display="default"
          onChange={onAndroidChange}
        />
      )}

      {Platform.OS === 'ios' && (
        <Modal visible={open} transparent animationType="slide">
          <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Pressable onPress={() => setOpen(false)}>
                <Text style={styles.headerBtn}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  // value is already kept in sync via onChange below
                  setOpen(false)
                }}
              >
                <Text style={[styles.headerBtn, styles.headerDone]}>Done</Text>
              </Pressable>
            </View>
            <DateTimePicker
              value={date}
              mode="date"
              display="spinner"
              onChange={(_: unknown, selected?: Date) => {
                if (selected) onChange(toYMD(selected))
              }}
              style={styles.picker}
            />
          </View>
        </Modal>
      )}
    </>
  )
}

const styles = StyleSheet.create({
  field: {
    borderWidth: 2,
    borderColor: INK,
    backgroundColor: CREAM,
    paddingHorizontal: 9,
    paddingVertical: 10,
    marginBottom: 4,
  },
  text: {
    fontFamily: MONO,
    fontSize: 14,
    color: INK,
  },
  placeholder: {
    color: '#999999',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    backgroundColor: CREAM,
    borderTopWidth: 3,
    borderTopColor: INK,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: INK,
  },
  headerBtn: {
    fontFamily: MONO,
    fontSize: 14,
    fontWeight: '700',
    color: INK,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  headerDone: {
    color: YELLOW,
  },
  picker: {
    backgroundColor: CREAM,
  },
})
