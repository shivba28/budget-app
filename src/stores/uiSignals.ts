import { create } from 'zustand'

type State = {
  addTripSignal: number
  triggerAddTrip: () => void
}

export const useUiSignals = create<State>((set) => ({
  addTripSignal: 0,
  triggerAddTrip: () => set((s) => ({ addTripSignal: s.addTripSignal + 1 })),
}))
