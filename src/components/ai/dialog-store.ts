import { create } from 'zustand'

/**
 * AI 设置弹窗的开关。
 *
 * 触发点分散在简历列表页工具栏、富文本字段工具栏、编辑器 dock 与生图页工具条里，
 * 而弹窗只挂一份在页面根部，所以用一个不持久化的模块级 store 串起来。
 */
type AIDialogState = {
  configOpen: boolean
  setConfigOpen: (open: boolean) => void
}

export const useAIDialogStore = create<AIDialogState>((set) => ({
  configOpen: false,
  setConfigOpen: (configOpen) => set({ configOpen }),
}))
