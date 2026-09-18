import { create } from 'zustand'

interface SearchState {
  /** Command Palette 开关（全局 Ctrl/Cmd+K） */
  open: boolean
  setOpen: (open: boolean) => void
}

export const useSearchStore = create<SearchState>()((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}))
