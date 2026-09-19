import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { DefaultCompressOption, normalizeCompressOption, type CompressOption } from './options'
import type { ProcessOutput } from './engines/image-base'
import type { OutputMessageData } from './engines/handler'

export type ImageStatus = 'processing' | 'done' | 'error'

export interface ImageItem {
  key: number
  name: string
  blob: Blob
  width: number
  height: number
  src: string
  preview?: ProcessOutput
  compress?: ProcessOutput
  status: ImageStatus
  processError?: string
  preservedOriginal?: boolean
}

interface CompressorState {
  /** key → 图片项（含原图与压缩结果） */
  list: Map<number, ImageItem>
  /** 当前生效的压缩选项（驱动 Worker） */
  option: CompressOption
  /** 选项面板的编辑态（未应用） */
  tempOption: CompressOption
  originSize: number
  outputSize: number
  completedCompressCount: number
  completedPreviewCount: number

  addItem: (item: ImageItem) => void
  removeItem: (key: number) => void
  clearAll: () => void
  setTempOption: (option: CompressOption) => void
  resetTempOption: () => void
  /** 应用选项：归一化后生效（调用方负责重新派发压缩） */
  applyOption: (option: CompressOption) => void
  /** 重置某项的压缩结果并标记 processing（调用方负责重新派发） */
  markPending: (key: number) => void
  /** Worker 消息回写（字段级更新，避免整行替换导致无谓重渲） */
  markMessage: (data: OutputMessageData) => void
}

let nextKey = 1
export function uniqId(): number {
  return nextKey++
}

/** 持久化：只存生效选项（读取时经 normalize 校验兜底） */
const compressorPersistOptions = {
  name: 'toolbox.image-compressor',
  version: 1,
  partialize: (state: CompressorState) => ({ option: state.option }) as unknown as CompressorState,
  merge: (persisted: unknown, current: CompressorState): CompressorState => {
    const saved = (persisted ?? {}) as { option?: unknown }
    const option = normalizeCompressOption(saved.option)
    return { ...current, option, tempOption: structuredClone(option) }
  },
}

export const useCompressorStore = create<CompressorState>()(
  persist(
    (set) => ({
      list: new Map(),
      option: structuredClone(DefaultCompressOption),
      tempOption: structuredClone(DefaultCompressOption),
      originSize: 0,
      outputSize: 0,
      completedCompressCount: 0,
      completedPreviewCount: 0,

      addItem: (item) =>
        set((state) => {
          const list = new Map(state.list)
          list.set(item.key, item)
          return { list, originSize: state.originSize + item.blob.size }
        }),

      removeItem: (key) =>
        set((state) => {
          const list = new Map(state.list)
          const item = list.get(key)
          if (!item) {
            return state
          }
          list.delete(key)
          return {
            list,
            originSize: state.originSize - item.blob.size,
            outputSize: state.outputSize - (item.compress?.blob.size ?? 0),
            completedCompressCount: item.compress
              ? state.completedCompressCount - 1
              : state.completedCompressCount,
          }
        }),

      clearAll: () =>
        set({
          list: new Map(),
          originSize: 0,
          outputSize: 0,
          completedCompressCount: 0,
          completedPreviewCount: 0,
        }),

      setTempOption: (tempOption) => set({ tempOption }),

      resetTempOption: () => set({ tempOption: structuredClone(DefaultCompressOption) }),

      applyOption: (raw) => {
        const option = normalizeCompressOption(raw)
        set((state) => {
          const list = new Map()
          for (const [key, item] of state.list) {
            list.set(key, {
              ...item,
              compress: undefined,
              preservedOriginal: false,
              processError: undefined,
              status: 'processing',
            })
          }
          return {
            option,
            tempOption: structuredClone(option),
            list,
            outputSize: 0,
            completedCompressCount: 0,
          }
        })
      },

      markPending: (key) =>
        set((state) => {
          const item = state.list.get(key)
          if (!item) {
            return state
          }
          const list = new Map(state.list)
          list.set(key, {
            ...item,
            compress: undefined,
            preservedOriginal: false,
            processError: undefined,
            status: 'processing',
          })
          return {
            list,
            outputSize: state.outputSize - (item.compress?.blob.size ?? 0),
            completedCompressCount: state.completedCompressCount - 1,
          }
        }),

      markMessage: (data) =>
        set((state) => {
          const item = state.list.get(data.key)
          if (!item) {
            return state
          }
          const next: ImageItem = { ...item }
          if (data.width) {
            next.width = data.width
          }
          if (data.height) {
            next.height = data.height
          }
          if (data.error) {
            next.processError = data.error
            next.status = 'error'
          }
          if (data.preservedOriginal !== undefined) {
            next.preservedOriginal = data.preservedOriginal
          }
          let { outputSize, completedCompressCount } = state
          if (data.compress) {
            if (!item.compress) {
              completedCompressCount += 1
            }
            outputSize += data.compress.blob.size - (item.compress?.blob.size ?? 0)
            next.compress = data.compress
            if (next.status !== 'error') {
              next.status = 'done'
            }
          }
          if (data.preview) {
            next.preview = data.preview
          }
          const list = new Map(state.list)
          list.set(data.key, next)
          return { list, outputSize, completedCompressCount }
        }),
    }),
    compressorPersistOptions,
  ),
)
