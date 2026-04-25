import { create } from 'zustand'

type EnterDirection = 'from-left' | 'from-right' | null

type SwipeNavStore = {
  enterDirection: EnterDirection
  setEnterDirection: (d: EnterDirection) => void
}

export const useSwipeNavStore = create<SwipeNavStore>((set) => ({
  enterDirection: null,
  setEnterDirection: (enterDirection) => set({ enterDirection }),
}))
