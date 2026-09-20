import { useMemo } from 'react'
import { create } from 'zustand'

import { useAIConfigStore } from '../../../ai/store'
import { resolveSlot } from '../../../ai/providers'
import type { AIModelTask } from '../../../ai/store'
import type { AIModelProfile } from '../../../ai/providers'

/**
 * AI 设置弹窗的开关。
 *
 * 触发点分散在列表页工具栏、每个富文本字段的工具栏和编辑器 dock 里，
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

/** AI 总开关是否打开——关掉时所有 AI 入口连按钮都不渲染 */
export function useAIEnabled() {
  return useAIConfigStore((state) => state.enabled)
}

/**
 * 某类任务当前可用的模型；没配好返回 null。
 *
 * 只订阅 store 里的既有引用（厂商名、型号字符串、凭证对象），解析放到 useMemo 里做：
 * resolveSlot 每次都返回新对象，直接当 selector 结果会让 zustand 认为状态一直在变，
 * 组件无限重渲染（React 报 Maximum update depth exceeded）。
 */
export function useTaskModel(task: AIModelTask): AIModelProfile | null {
  const provider = useAIConfigStore((state) => state.activeProvider)
  const model = useAIConfigStore((state) => state.picks[provider][task])
  const credentials = useAIConfigStore((state) => state.credentials[provider])
  return useMemo(
    () => (model ? resolveSlot({ provider, model }, credentials, task) : null),
    [credentials, model, provider, task],
  )
}

/**
 * 统一的「能不能用 AI」判定。
 *
 * 未开启总开关时静默不可见；开了但没配模型时要给 toast 并把设置弹窗拉起来，
 * 不能让用户点了没反应。
 */
export function useAIGate(task: AIModelTask) {
  const enabled = useAIEnabled()
  const model = useTaskModel(task)
  const setConfigOpen = useAIDialogStore((state) => state.setConfigOpen)
  return { enabled, model: enabled ? model : null, openConfig: () => setConfigOpen(true) }
}
