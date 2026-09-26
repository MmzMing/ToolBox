import { create } from 'zustand'

interface SearchState {
  /** Command Palette 开关（全局 Ctrl/Cmd+K） */
  open: boolean
  /**
   * 面板查询词。放在 store 而不是组件里，是为了让「打开即清空」在顶栏按钮、
   * 快捷键、Dialog 三个入口上时序一致；关闭时不清，否则淡出那一帧会跳回全量列表。
   */
  query: string
  setOpen: (open: boolean) => void
  setQuery: (query: string) => void
}

export const useSearchStore = create<SearchState>()((set) => ({
  open: false,
  query: '',
  setOpen: (open) => set(open ? { open, query: '' } : { open }),
  setQuery: (query) => set({ query }),
}))
