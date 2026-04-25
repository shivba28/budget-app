import { create } from 'zustand'

type TabStore = {
  activeIndex: number
  setActiveIndex: (i: number) => void
}

export const useTabStore = create<TabStore>((set) => ({
  activeIndex: 0,
  setActiveIndex: (activeIndex) => set({ activeIndex }),
}))
