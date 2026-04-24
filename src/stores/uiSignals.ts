import { create } from 'zustand'

type State = {
  addTripSignal: number
  triggerAddTrip: () => void
  addTransactionSignal: number
  triggerAddTransaction: () => void
}

export const useUiSignals = create<State>((set) => ({
  addTripSignal: 0,
  triggerAddTrip: () => set((s) => ({ addTripSignal: s.addTripSignal + 1 })),
  addTransactionSignal: 0,
  triggerAddTransaction: () => set((s) => ({ addTransactionSignal: s.addTransactionSignal + 1 })),
}))
