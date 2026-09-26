import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import {
  autoAssign,
  clampCustomSize,
  CUSTOM_SIZE_KEY,
  DEFAULT_EXPORT,
  DEFAULT_RATIO,
  DEFAULT_STYLE,
  equalGrid,
  fitTracks,
  MAX_TRACKS,
  normalizeCustomSize,
  normalizeExport,
  normalizeFocus,
  normalizePresetKey,
  normalizeRatioKey,
  normalizeStyle,
  panFocus,
  resizeLayers,
  type ExportOption,
  type Fit,
  type Focus,
  type GridLayer,
  type GridTemplate,
  type RatioKey,
  type SceneStyle,
  type Size,
} from './image-stack.service'
import {
  DEFAULT_SPLIT_TEMPLATE,
  DEFAULT_STITCH_TEMPLATE,
  findTemplate,
  SPLIT_CUSTOM_TEMPLATE,
  SPLIT_TEMPLATES,
  STITCH_CUSTOM_TEMPLATE,
} from './templates'
import { layoutById, MAX_LAYOUT_COUNT } from './layouts'
import { decodeAsset, disposeAsset, isReady, newAssetId, type AssetItem } from './assets'

export type Mode = 'stitch' | 'split'

/** 素材条 → 单元格的原生拖拽载荷类型；自定义 MIME 避免和外部拖入的文件混淆 */
export const IMAGE_DRAG_MIME = 'text/x-image-stack'

const DEFAULT_SPLIT_COLS = 3
const DEFAULT_SPLIT_ROWS = 3
const DEFAULT_SPLIT_FOCUS: Focus = { x: 0, y: 0, zoom: 1 }
const DEFAULT_STITCH_COLS = 3
const DEFAULT_STITCH_ROWS = 2
const DEFAULT_STITCH_CELLS = 4
const DEFAULT_CUSTOM_SIZE: Size = { width: 1080, height: 1080 }

/** 版式张数的合法区间；它决定模板目录出哪一套，与素材数是两回事 */
function clampLayoutCount(value: unknown, fallback: number): number {
  const count = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback
  return Math.min(MAX_LAYOUT_COUNT, Math.max(1, count))
}

interface ImageStackState {
  mode: Mode
  /** 素材列表，含解码失败项；运行时数据，不持久化 */
  items: AssetItem[]
  isDecoding: boolean

  stitchTemplateId: string
  /** 版式张数：决定模板目录出哪一套，与素材数解耦，一张素材可以铺满多格 */
  stitchCells: number
  /** 仅 stitchTemplateId 为自定义档时生效 */
  stitchCols: number
  stitchRows: number
  /** 与模板单元格一一对应；imageId 为 null 表示空格子 */
  layers: GridLayer[]
  selectedCell: number | null
  /** 拖拽悬停的目标单元格：单元格内搬移与素材条拖入共用这一个高亮 */
  hoverCell: number | null
  /** 正在从素材条拖出的素材 id，仅用于拖拽态样式 */
  draggingImageId: string | null
  /** 素材条上选中的「画笔」，点单元格即落位 */
  brushId: string | null

  splitTemplateId: string
  splitCols: number
  splitRows: number
  splitSourceId: string | null
  /** 裁切框在源图里的平移缩放焦点；拖拽与滚轮改的就是它 */
  splitFocus: Focus

  ratioKey: RatioKey
  presetKey: string
  customSize: Size

  style: SceneStyle
  exportOption: ExportOption

  setMode: (mode: Mode) => void
  addFiles: (files: readonly File[]) => Promise<void>
  removeItem: (id: string) => void
  clearItems: () => void
  reorderItems: (activeId: string, overId: string) => void

  setStitchTemplate: (id: string) => void
  /** 换版式张数：模板目录整套换掉，选中态按 id 落在新目录里的同位置版式 */
  setStitchCells: (count: number) => void
  /** 切到自定义档并写入行列；行列一律经 equalGrid 收敛，state 里不会出现越界组合 */
  setStitchGrid: (cols: number, rows: number) => void
  selectCell: (index: number | null) => void
  setHoverCell: (index: number | null) => void
  setDraggingImage: (id: string | null) => void
  /** 单元格之间搬移：目标格已有图则交换，避免把图弄丢 */
  swapCells: (a: number, b: number) => void
  setCellFocus: (index: number, focus: Focus) => void
  setBrush: (id: string | null) => void
  assignCell: (index: number, imageId: string | null) => void
  cycleCell: (index: number) => void
  panCellFocus: (index: number, dxRatio: number, dyRatio: number) => void
  setCellFit: (index: number, fit: Fit) => void
  resetCellFocus: (index: number) => void
  autoFill: () => void

  setSplitTemplate: (id: string) => void
  setSplitGrid: (cols: number, rows: number) => void
  setSplitSource: (id: string) => void
  setSplitFocus: (focus: Focus) => void
  resetSplitFocus: () => void

  setRatio: (key: RatioKey) => void
  setPreset: (key: string) => void
  setCustomSize: (size: Size) => void
  setStyle: (patch: Partial<SceneStyle>) => void
  setExportOption: (patch: Partial<ExportOption>) => void
}

/**
 * 拼接模板：自定义档由行列数生成；其余按 stitchCells（版式张数）走生成器取该族的版式。
 * 张数与素材数无关，所以只放一张图也能翻出整套错落版式，那一张可以重复铺进多个格子。
 */
export function stitchTemplateOf(
  id: string,
  count: number,
  cols: number,
  rows: number,
): GridTemplate {
  if (id === STITCH_CUSTOM_TEMPLATE) {
    return equalGrid(STITCH_CUSTOM_TEMPLATE, cols, rows)
  }
  const slots = clampLayoutCount(count, DEFAULT_STITCH_CELLS)
  return layoutById(slots, id) ?? equalGrid(STITCH_CUSTOM_TEMPLATE, cols, rows)
}

/** 拆分模板：自定义档由行列数现场生成，其余直接查表 */
export function splitTemplateOf(id: string, cols: number, rows: number): GridTemplate {
  if (id === SPLIT_CUSTOM_TEMPLATE) {
    return equalGrid(SPLIT_CUSTOM_TEMPLATE, cols, rows)
  }
  return findTemplate(SPLIT_TEMPLATES, id, DEFAULT_SPLIT_TEMPLATE)
}

type StitchLayout = Pick<
  ImageStackState,
  'stitchTemplateId' | 'stitchCells' | 'stitchCols' | 'stitchRows'
>

/** 图层数始终跟着当前模板的单元格数走，不能用 layers.length（首屏它是空的） */
function cellCountOf(state: StitchLayout): number {
  return stitchTemplateOf(
    state.stitchTemplateId,
    state.stitchCells,
    state.stitchCols,
    state.stitchRows,
  ).cells.length
}

function readyIds(items: readonly AssetItem[]): string[] {
  return items.filter(isReady).map((item) => item.id)
}

/** 清掉已不存在素材的引用，再拿未使用的素材把空格子补上（不动已落位的格子） */
function syncLayers(
  layers: readonly GridLayer[],
  count: number,
  ids: readonly string[],
): GridLayer[] {
  const available = new Set(ids)
  const pruned = resizeLayers(layers, count).map((layer) =>
    layer.imageId && available.has(layer.imageId) ? layer : { ...layer, imageId: null },
  )
  const used = new Set(pruned.map((layer) => layer.imageId))
  const queue = ids.filter((id) => !used.has(id))
  if (queue.length === 0) {
    return pruned
  }
  let cursor = 0
  return pruned.map((layer) => {
    if (layer.imageId !== null) {
      return layer
    }
    const next = queue[cursor]
    cursor += 1
    return next ? { ...layer, imageId: next } : layer
  })
}

function patchLayer(state: ImageStackState, index: number, patch: Partial<GridLayer>): GridLayer[] {
  return state.layers.map((layer, position) =>
    position === index ? { ...layer, ...patch } : layer,
  )
}

function readTrackCount(raw: unknown, fallback: number): number {
  const value = typeof raw === 'number' && Number.isFinite(raw) ? Math.round(raw) : fallback
  return Math.min(MAX_TRACKS, Math.max(1, value))
}

/**
 * 行列对经 fitTracks 收敛：单轴封顶与总格数预算一次算清，
 * 所以 state 与 localStorage 里都不会留下 10×10 这类旧上限时代的组合。
 */
function readTracks(
  rawCols: unknown,
  rawRows: unknown,
  fallback: [number, number],
): { cols: number; rows: number } {
  const [cols, rows] = fitTracks(
    readTrackCount(rawCols, fallback[0]),
    readTrackCount(rawRows, fallback[1]),
  )
  return { cols, rows }
}

function readString(raw: unknown, fallback: string): string {
  return typeof raw === 'string' && raw.length > 0 ? raw : fallback
}

function firstReadyId(items: readonly AssetItem[], current: string | null): string | null {
  const ids = readyIds(items)
  return current && ids.includes(current) ? current : (ids[0] ?? null)
}

/** 只持久化配置项：素材是 ImageBitmap，序列化不了也存不下 */
const imageStackPersistOptions = {
  name: 'toolbox.image-stack',
  version: 1,
  // 旧版本缺字段时交给 merge 逐字段兜底，无需专门迁移
  migrate: (persisted: unknown) => persisted,
  partialize: (state: ImageStackState) =>
    ({
      mode: state.mode,
      stitchTemplateId: state.stitchTemplateId,
      stitchCells: state.stitchCells,
      stitchCols: state.stitchCols,
      stitchRows: state.stitchRows,
      splitTemplateId: state.splitTemplateId,
      splitCols: state.splitCols,
      splitRows: state.splitRows,
      splitFocus: state.splitFocus,
      ratioKey: state.ratioKey,
      presetKey: state.presetKey,
      customSize: state.customSize,
      style: state.style,
      exportOption: state.exportOption,
    }) as unknown as ImageStackState,
  merge: (persisted: unknown, current: ImageStackState): ImageStackState => {
    const saved = (persisted ?? {}) as Record<string, unknown>
    const ratioKey = normalizeRatioKey(saved.ratioKey)
    const stitchTemplateId = readString(saved.stitchTemplateId, DEFAULT_STITCH_TEMPLATE)
    const stitchCells = clampLayoutCount(saved.stitchCells, DEFAULT_STITCH_CELLS)
    const stitch = readTracks(saved.stitchCols, saved.stitchRows, [
      DEFAULT_STITCH_COLS,
      DEFAULT_STITCH_ROWS,
    ])
    const split = readTracks(saved.splitCols, saved.splitRows, [
      DEFAULT_SPLIT_COLS,
      DEFAULT_SPLIT_ROWS,
    ])
    return {
      ...current,
      mode: saved.mode === 'split' ? 'split' : 'stitch',
      stitchTemplateId,
      stitchCells,
      stitchCols: stitch.cols,
      stitchRows: stitch.rows,
      // 图层不持久化，长度必须跟上恢复出来的模板；此刻还没有素材
      layers: resizeLayers(
        [],
        stitchTemplateOf(stitchTemplateId, stitchCells, stitch.cols, stitch.rows).cells.length,
      ),
      splitTemplateId: readString(saved.splitTemplateId, DEFAULT_SPLIT_TEMPLATE),
      splitCols: split.cols,
      splitRows: split.rows,
      splitFocus: normalizeFocus(saved.splitFocus),
      ratioKey,
      presetKey: normalizePresetKey(ratioKey, saved.presetKey),
      customSize: normalizeCustomSize(saved.customSize),
      style: normalizeStyle(saved.style),
      exportOption: normalizeExport(saved.exportOption),
    }
  },
}

export const useImageStackStore = create<ImageStackState>()(
  persist(
    (set) => ({
      mode: 'stitch',
      items: [],
      isDecoding: false,

      stitchTemplateId: DEFAULT_STITCH_TEMPLATE,
      stitchCells: DEFAULT_STITCH_CELLS,
      stitchCols: DEFAULT_STITCH_COLS,
      stitchRows: DEFAULT_STITCH_ROWS,
      layers: resizeLayers(
        [],
        stitchTemplateOf(
          DEFAULT_STITCH_TEMPLATE,
          DEFAULT_STITCH_CELLS,
          DEFAULT_STITCH_COLS,
          DEFAULT_STITCH_ROWS,
        ).cells.length,
      ),
      selectedCell: null,
      hoverCell: null,
      draggingImageId: null,
      brushId: null,

      splitTemplateId: DEFAULT_SPLIT_TEMPLATE,
      splitCols: DEFAULT_SPLIT_COLS,
      splitRows: DEFAULT_SPLIT_ROWS,
      splitSourceId: null,
      splitFocus: { ...DEFAULT_SPLIT_FOCUS },

      ratioKey: DEFAULT_RATIO,
      presetKey: 'web',
      customSize: DEFAULT_CUSTOM_SIZE,

      style: { ...DEFAULT_STYLE },
      exportOption: { ...DEFAULT_EXPORT },

      setMode: (mode) => set({ mode, selectedCell: null }),

      addFiles: async (files) => {
        const images = files.filter((file) => file.type.startsWith('image/'))
        if (images.length === 0) {
          return
        }
        set({ isDecoding: true })
        const decoded = await Promise.all(images.map((file) => decodeAsset(file, newAssetId())))
        set((state) => {
          const items = [...state.items, ...decoded]
          const ids = readyIds(items)
          // 素材变多时把版式张数抬到同一个数（只抬不降，所以删图不会让模板目录塌回一格）
          const stitchCells = Math.max(state.stitchCells, clampLayoutCount(ids.length, 1))
          const layout = { ...state, stitchCells }
          return {
            items,
            isDecoding: false,
            stitchCells,
            layers: syncLayers(state.layers, cellCountOf(layout), ids),
            splitSourceId: firstReadyId(items, state.splitSourceId),
          }
        })
      },

      removeItem: (id) =>
        set((state) => {
          const target = state.items.find((item) => item.id === id)
          if (target && isReady(target)) {
            disposeAsset(target)
          }
          const items = state.items.filter((item) => item.id !== id)
          return {
            items,
            layers: syncLayers(state.layers, cellCountOf(state), readyIds(items)),
            brushId: state.brushId === id ? null : state.brushId,
            splitSourceId: firstReadyId(items, state.splitSourceId),
          }
        }),

      clearItems: () =>
        set((state) => {
          for (const item of state.items) {
            if (isReady(item)) {
              disposeAsset(item)
            }
          }
          return {
            items: [],
            layers: resizeLayers([], cellCountOf(state)),
            selectedCell: null,
            brushId: null,
            splitSourceId: null,
          }
        }),

      reorderItems: (activeId, overId) =>
        set((state) => {
          const from = state.items.findIndex((item) => item.id === activeId)
          const to = state.items.findIndex((item) => item.id === overId)
          if (from < 0 || to < 0 || from === to) {
            return state
          }
          const items = [...state.items]
          const [moved] = items.splice(from, 1)
          if (!moved) {
            return state
          }
          items.splice(to, 0, moved)
          return {
            items,
            layers: syncLayers(state.layers, cellCountOf(state), readyIds(items)),
          }
        }),

      setStitchTemplate: (id) =>
        set((state) => ({
          stitchTemplateId: id,
          layers: syncLayers(
            state.layers,
            stitchTemplateOf(id, state.stitchCells, state.stitchCols, state.stitchRows).cells
              .length,
            readyIds(state.items),
          ),
          selectedCell: null,
        })),

      setStitchCells: (count) =>
        set((state) => {
          const stitchCells = clampLayoutCount(count, state.stitchCells)
          const layout = { ...state, stitchCells }
          return {
            stitchCells,
            layers: syncLayers(state.layers, cellCountOf(layout), readyIds(state.items)),
            selectedCell: null,
          }
        }),

      setStitchGrid: (cols, rows) =>
        set((state) => {
          const [nextCols, nextRows] = fitTracks(cols, rows)
          return {
            stitchTemplateId: STITCH_CUSTOM_TEMPLATE,
            stitchCols: nextCols,
            stitchRows: nextRows,
            layers: syncLayers(state.layers, nextCols * nextRows, readyIds(state.items)),
            selectedCell: null,
          }
        }),

      selectCell: (selectedCell) => set({ selectedCell }),

      setHoverCell: (hoverCell) => set({ hoverCell }),

      setDraggingImage: (draggingImageId) => set({ draggingImageId }),

      swapCells: (a, b) =>
        set((state) => {
          if (a === b || a < 0 || b < 0 || a >= state.layers.length || b >= state.layers.length) {
            return { hoverCell: null }
          }
          const source = state.layers[a]
          const target = state.layers[b]
          if (!source || !target) {
            return { hoverCell: null }
          }
          return {
            layers: state.layers.map((layer, index) =>
              index === a ? target : index === b ? source : layer,
            ),
            selectedCell: null,
            hoverCell: null,
          }
        }),

      setCellFocus: (index, focus) =>
        set((state) => ({ layers: patchLayer(state, index, { focus }) })),

      setBrush: (brushId) =>
        set((state) => {
          // 已选中单元格时，点素材直接落位；否则只是拿起「画笔」
          if (state.selectedCell === null) {
            return { brushId }
          }
          return { brushId, layers: patchLayer(state, state.selectedCell, { imageId: brushId }) }
        }),

      assignCell: (index, imageId) =>
        set((state) => ({ layers: patchLayer(state, index, { imageId }) })),

      cycleCell: (index) =>
        set((state) => {
          const ids = readyIds(state.items)
          if (ids.length === 0) {
            return state
          }
          const current = state.layers[index]?.imageId ?? null
          const position = current === null ? -1 : ids.indexOf(current)
          return {
            layers: patchLayer(state, index, { imageId: ids[(position + 1) % ids.length] }),
          }
        }),

      panCellFocus: (index, dxRatio, dyRatio) =>
        set((state) => {
          const layer = state.layers[index]
          if (!layer) {
            return state
          }
          return {
            layers: patchLayer(state, index, {
              focus: panFocus(layer.focus, dxRatio, dyRatio),
            }),
          }
        }),

      setCellFit: (index, fit) => set((state) => ({ layers: patchLayer(state, index, { fit }) })),

      resetCellFocus: (index) =>
        set((state) => ({
          layers: patchLayer(state, index, { focus: { x: 0, y: 0, zoom: 1 } }),
        })),

      autoFill: () =>
        set((state) => ({
          layers: autoAssign(readyIds(state.items), cellCountOf(state)),
        })),

      setSplitTemplate: (id) => {
        if (id === SPLIT_CUSTOM_TEMPLATE) {
          set({ splitTemplateId: id })
          return
        }
        const template = findTemplate(SPLIT_TEMPLATES, id, DEFAULT_SPLIT_TEMPLATE)
        set({
          splitTemplateId: id,
          splitCols: template.cols.length,
          splitRows: template.rows.length,
        })
      },

      setSplitGrid: (cols, rows) =>
        set(() => {
          const [nextCols, nextRows] = fitTracks(cols, rows)
          return {
            splitTemplateId: SPLIT_CUSTOM_TEMPLATE,
            splitCols: nextCols,
            splitRows: nextRows,
          }
        }),

      setSplitSource: (splitSourceId) => set({ splitSourceId }),

      setSplitFocus: (splitFocus) => set({ splitFocus }),

      resetSplitFocus: () => set({ splitFocus: { ...DEFAULT_SPLIT_FOCUS } }),

      setRatio: (ratioKey) =>
        set((state) => ({
          ratioKey,
          presetKey:
            state.presetKey === CUSTOM_SIZE_KEY
              ? CUSTOM_SIZE_KEY
              : normalizePresetKey(ratioKey, state.presetKey),
        })),

      setPreset: (presetKey) => set({ presetKey }),

      setCustomSize: (size) =>
        set({ presetKey: CUSTOM_SIZE_KEY, customSize: clampCustomSize(size.width, size.height) }),

      setStyle: (patch) =>
        set((state) => ({ style: normalizeStyle({ ...state.style, ...patch }) })),

      setExportOption: (patch) =>
        set((state) => ({ exportOption: normalizeExport({ ...state.exportOption, ...patch }) })),
    }),
    imageStackPersistOptions,
  ),
)
