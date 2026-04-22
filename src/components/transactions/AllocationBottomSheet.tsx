import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet'
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetTextInput,
} from '@gorhom/bottom-sheet'
import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { BrutalButton } from '@/src/components/Brutalist'
import type { TransactionRow } from '@/src/db/queries/transactions'
import {
  clearAllocationPatch,
  markPostedPatch,
} from '@/src/lib/transactions/allocation'
import { useCategoriesStore } from '@/src/stores/categoriesStore'
import { useTransactionsStore } from '@/src/stores/transactionsStore'
import { useTripsStore } from '@/src/stores/tripsStore'
import { tokens } from '@/src/theme/tokens'

type Props = {
  transactionId: string | null
  onDismiss: () => void
}

export const AllocationBottomSheet = forwardRef<BottomSheetModal, Props>(
  function AllocationBottomSheet({ transactionId, onDismiss }, ref) {
    const update = useTransactionsStore((s) => s.update)
    const items = useTransactionsStore((s) => s.items)
    const tx = useMemo(
      () => (transactionId ? items.find((t) => t.id === transactionId) : null),
      [items, transactionId],
    )

    const categories = useCategoriesStore((s) => s.items)
    const loadCategories = useCategoriesStore((s) => s.load)
    const trips = useTripsStore((s) => s.items)
    const loadTrips = useTripsStore((s) => s.load)
    const addTrip = useTripsStore((s) => s.add)

    const [deferDate, setDeferDate] = useState('')
    const [tripId, setTripId] = useState<number | null>(null)
    const [myShare, setMyShare] = useState('')
    const [category, setCategory] = useState<string | null>(null)
    const [newTripName, setNewTripName] = useState('')

    useEffect(() => {
      loadCategories()
      loadTrips()
    }, [loadCategories, loadTrips])

    useEffect(() => {
      if (!tx) return
      setDeferDate(tx.effective_date ?? '')
      setTripId(tx.trip_id ?? null)
      setMyShare(tx.my_share != null ? String(tx.my_share) : '')
      setCategory(tx.category ?? null)
      setNewTripName('')
    }, [tx?.id])

    const snapPoints = useMemo(() => ['52%', '88%'], [])

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

    const saveAllocation = () => {
      if (!tx) return
      const shareRaw = myShare.trim()
      const share = shareRaw === '' ? null : Number(shareRaw)
      const patch: Partial<TransactionRow> = {
        effective_date: deferDate.trim() === '' ? null : deferDate.trim(),
        trip_id: tripId,
        my_share: share !== null && !Number.isNaN(share) ? share : null,
        category,
        detail_category: null,
      }
      update(tx.id, patch)
    }

    const onClear = () => {
      if (!tx) return
      update(tx.id, clearAllocationPatch())
      if (tx) {
        setDeferDate('')
        setTripId(null)
        setMyShare('')
        setCategory(null)
      }
    }

    const onMarkPosted = () => {
      if (!tx) return
      update(tx.id, markPostedPatch())
    }

    const createTripInline = () => {
      const n = newTripName.trim()
      if (!n) return
      const id = addTrip({ name: n })
      setTripId(id)
      setNewTripName('')
    }

    return (
      <BottomSheetModal
        ref={ref}
        snapPoints={snapPoints}
        enablePanDownToClose
        onDismiss={onDismiss}
        backdropComponent={renderBackdrop}
        backgroundStyle={sheetStyles.sheetBg}
        handleIndicatorStyle={sheetStyles.handle}
      >
        {tx ? (
        <BottomSheetScrollView
          contentContainerStyle={sheetStyles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={sheetStyles.kicker}>ALLOCATION</Text>
          <Text style={sheetStyles.title} numberOfLines={2}>
            {tx.description}
          </Text>
          <Text style={sheetStyles.meta}>
            {tx.date} · {tx.source}
            {tx.pending === 1 ? ' · pending' : ''}
          </Text>

          <Text style={sheetStyles.label}>Defer to date (effective_date)</Text>
          <BottomSheetTextInput
            style={sheetStyles.input}
            value={deferDate}
            onChangeText={setDeferDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="rgba(17,17,17,0.45)"
            autoCapitalize="none"
          />

          <Text style={sheetStyles.label}>Trip</Text>
          <View style={sheetStyles.chips}>
            <Pressable
              onPress={() => setTripId(null)}
              style={[sheetStyles.chip, tripId === null && sheetStyles.chipOn]}
            >
              <Text style={sheetStyles.chipText}>None</Text>
            </Pressable>
            {trips.map((tr) => (
              <Pressable
                key={tr.id}
                onPress={() => setTripId(tr.id)}
                style={[
                  sheetStyles.chip,
                  tripId === tr.id && sheetStyles.chipOn,
                ]}
              >
                <Text style={sheetStyles.chipText}>{tr.name}</Text>
              </Pressable>
            ))}
          </View>
          <View style={sheetStyles.inlineTrip}>
            <BottomSheetTextInput
              style={[sheetStyles.input, sheetStyles.inlineInput]}
              value={newTripName}
              onChangeText={setNewTripName}
              placeholder="New trip name"
              placeholderTextColor="rgba(17,17,17,0.45)"
            />
            <Pressable
              onPress={createTripInline}
              style={({ pressed }) => [
                sheetStyles.miniBtn,
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text style={sheetStyles.miniBtnText}>Add</Text>
            </Pressable>
          </View>

          <Text style={sheetStyles.label}>My share (optional)</Text>
          <BottomSheetTextInput
            style={sheetStyles.input}
            value={myShare}
            onChangeText={setMyShare}
            keyboardType="decimal-pad"
            placeholder="Split / share amount"
            placeholderTextColor="rgba(17,17,17,0.45)"
          />

          <Text style={sheetStyles.label}>Category override</Text>
          <View style={sheetStyles.chips}>
            <Pressable
              onPress={() => setCategory(null)}
              style={[sheetStyles.chip, category === null && sheetStyles.chipOn]}
            >
              <Text style={sheetStyles.chipText}>None</Text>
            </Pressable>
            {categories.map((c) => (
              <Pressable
                key={c.id}
                onPress={() => setCategory(c.label)}
                style={[
                  sheetStyles.chip,
                  category === c.label && sheetStyles.chipOn,
                ]}
              >
                <Text style={sheetStyles.chipText}>{c.label}</Text>
              </Pressable>
            ))}
          </View>

          <View style={sheetStyles.actions}>
            <BrutalButton title="Save allocation" onPress={saveAllocation} />
            {tx.pending === 1 ? (
              <BrutalButton
                title="Mark as posted"
                variant="neutral"
                onPress={onMarkPosted}
              />
            ) : null}
            <BrutalButton
              title="Clear allocation"
              variant="neutral"
              onPress={onClear}
            />
          </View>
        </BottomSheetScrollView>
        ) : null}
      </BottomSheetModal>
    )
  },
)

const sheetStyles = StyleSheet.create({
  sheetBg: {
    backgroundColor: tokens.color.bg,
    borderWidth: tokens.border.w3,
    borderColor: tokens.color.border,
  },
  handle: {
    backgroundColor: tokens.color.border,
    width: 48,
  },
  scroll: {
    paddingHorizontal: tokens.space[5],
    paddingBottom: tokens.space[6] + tokens.space[6],
  },
  kicker: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    color: tokens.color.fg,
    marginBottom: tokens.space[2],
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: tokens.color.fg,
    marginBottom: tokens.space[2],
  },
  meta: {
    fontFamily: tokens.font.mono,
    fontSize: 12,
    color: tokens.color.fg,
    opacity: 0.7,
    marginBottom: tokens.space[5],
  },
  label: {
    fontFamily: tokens.font.mono,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: tokens.space[2],
    marginTop: tokens.space[3],
    color: tokens.color.fg,
  },
  input: {
    borderWidth: tokens.border.w3,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.sm,
    paddingHorizontal: tokens.space[4],
    paddingVertical: tokens.space[3],
    fontSize: 16,
    fontWeight: '600',
    color: tokens.color.fg,
    backgroundColor: tokens.color.card,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.space[2],
    marginBottom: tokens.space[2],
  },
  chip: {
    borderWidth: tokens.border.w3,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.sm,
    paddingHorizontal: tokens.space[3],
    paddingVertical: tokens.space[2],
    backgroundColor: tokens.color.card,
  },
  chipOn: {
    backgroundColor: tokens.color.accent,
  },
  chipText: {
    fontWeight: '700',
    fontSize: 13,
    color: tokens.color.fg,
  },
  inlineTrip: {
    flexDirection: 'row',
    gap: tokens.space[2],
    alignItems: 'center',
    marginBottom: tokens.space[2],
  },
  inlineInput: { flex: 1 },
  miniBtn: {
    borderWidth: tokens.border.w3,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.sm,
    paddingHorizontal: tokens.space[4],
    paddingVertical: tokens.space[3],
    backgroundColor: tokens.color.accent,
  },
  miniBtnText: {
    fontWeight: '800',
    fontSize: 13,
    color: tokens.color.fg,
  },
  actions: {
    gap: tokens.space[3],
    marginTop: tokens.space[5],
  },
})
