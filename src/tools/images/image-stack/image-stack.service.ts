import { sanitizeFileName } from '@/utils/file-name'

/** 画布边长上限：再大 canvas 会静默失败或直接吃满内存 */
export const MAX_CANVAS_SIDE = 8192
/** 画布面积上限（约 8192×4096），拦住细长条把内存打爆 */
export const MAX_CANVAS_AREA = 33_554_432
/** 自定义画布的边长下限，再小就没法看了 */
export const MIN_CANVAS_SIDE = 16
/** 预览位图的最长边：够看清构图即可，导出另用原图 */
export const PREVIEW_MAX_SIDE = 1600
/** 自定义行列数的单轴上限，再密格子就没法看了 */
export const MAX_TRACKS = 12
/**
 * 总格数上限。单轴各自封顶还不够：12×12 = 144 张切片要在主线程跑 144 次
 * OffscreenCanvas + convertToBlob，P2 Worker 化之前必须挡住。
 */
export const MAX_CELLS = 36
/** 一维「份数」的下限：切成 1 份没有意义 */
export const MIN_COUNT = 2

export const MAX_PADDING = 400
export const MAX_GAP = 200
export const MAX_RADIUS = 400

/** cover 缩放行程：1 = 刚好铺满，小于 1 会露背景 */
export const MIN_ZOOM = 1
export const MAX_ZOOM = 4

export const CUSTOM_SIZE_KEY = 'custom'

export type Rect = { x: number; y: number; width: number; height: number }
export type Size = { width: number; height: number }

/** 网格单元格：col/row 为轨道下标，span 让一格吃掉相邻轨道与其间的间距 */
export type GridCell = { col: number; row: number; colSpan?: number; rowSpan?: number }

/**
 * 拼接与拆分共用的版式描述。cols/rows 是归一化权重（和为 1），
 * 所以切换画布比例时版式自动适配；拖拽切割线本质就是改这两组权重。
 */
export type GridTemplate = {
  id: string
  cols: readonly number[]
  rows: readonly number[]
  cells: readonly GridCell[]
}

export type Fit = 'cover' | 'contain'
/** cover 的裁切偏移：x/y ∈ [-1,1]，0 为居中 */
export type Focus = { x: number; y: number; zoom: number }
/** imageId 为 null = 空格子，导出时露背景 */
export type GridLayer = { imageId: string | null; fit: Fit; focus: Focus }

export type Background = { type: 'color'; value: string } | { type: 'transparent' }

export type SceneStyle = {
  padding: number
  gap: number
  cellRadius: number
  canvasRadius: number
  background: Background
}

/** 一次渲染所需的全部数据，预览与导出共用 */
export type Scene = {
  canvas: Size
  style: SceneStyle
  template: GridTemplate
  layers: readonly GridLayer[]
}

export const CANVAS_RATIOS = [
  { key: '1:1', width: 1, height: 1 },
  { key: '3:4', width: 3, height: 4 },
  { key: '9:16', width: 9, height: 16 },
  { key: '4:3', width: 4, height: 3 },
  { key: '16:9', width: 16, height: 9 },
] as const

export type RatioKey = (typeof CANVAS_RATIOS)[number]['key']

export const DEFAULT_RATIO: RatioKey = '1:1'

export type CanvasSizePreset = { key: 'web' | 'hd' | 'ultra'; width: number; height: number }

function preset(key: CanvasSizePreset['key'], width: number, height: number): CanvasSizePreset {
  return { key, width, height }
}

/** 每个比例的三档常用尺寸：社交发布 / 高清 / 超清印刷 */
export const CANVAS_SIZE_PRESETS: Record<RatioKey, readonly CanvasSizePreset[]> = {
  '1:1': [preset('web', 1080, 1080), preset('hd', 2048, 2048), preset('ultra', 2480, 2480)],
  '3:4': [preset('web', 1080, 1440), preset('hd', 1620, 2160), preset('ultra', 2480, 3307)],
  '9:16': [preset('web', 1080, 1920), preset('hd', 1440, 2560), preset('ultra', 2160, 3840)],
  '4:3': [preset('web', 1440, 1080), preset('hd', 2160, 1620), preset('ultra', 3307, 2480)],
  '16:9': [preset('web', 1920, 1080), preset('hd', 2560, 1440), preset('ultra', 3840, 2160)],
}

export type ExportFormat = 'png' | 'jpeg' | 'webp'

export const EXPORT_FORMATS: readonly ExportFormat[] = ['png', 'jpeg', 'webp']

export type ExportOption = { format: ExportFormat; quality: number }

export const DEFAULT_EXPORT: ExportOption = { format: 'png', quality: 0.92 }

export const DEFAULT_STYLE: SceneStyle = {
  padding: 0,
  gap: 8,
  cellRadius: 0,
  canvasRadius: 0,
  background: { type: 'color', value: '#ffffff' },
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function clamp01(value: number): number {
  return clamp(value, 0, 1)
}

export function ratioValue(key: RatioKey): number {
  const ratio = CANVAS_RATIOS.find((item) => item.key === key) ?? CANVAS_RATIOS[0]
  return ratio.width / ratio.height
}

/** 校验并取整画布尺寸；非法值直接抛错，由 UI 层捕获降级 */
export function assertCanvasSize(size: Size): Size {
  const { width, height } = size
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error(`Invalid canvas size: ${width}x${height}`)
  }
  if (width > MAX_CANVAS_SIDE || height > MAX_CANVAS_SIDE) {
    throw new Error(`Canvas side exceeds ${MAX_CANVAS_SIDE}px: ${width}x${height}`)
  }
  if (width * height > MAX_CANVAS_AREA) {
    throw new Error(`Canvas area exceeds ${MAX_CANVAS_AREA}px: ${width}x${height}`)
  }
  return { width: Math.round(width), height: Math.round(height) }
}

export function resolveCanvasSize(ratioKey: RatioKey, presetKey: string, custom: Size): Size {
  if (presetKey === CUSTOM_SIZE_KEY) {
    return assertCanvasSize(custom)
  }
  const presets = CANVAS_SIZE_PRESETS[ratioKey] ?? CANVAS_SIZE_PRESETS[DEFAULT_RATIO]
  const matched = presets.find((item) => item.key === presetKey) ?? presets[0]
  return { width: matched.width, height: matched.height }
}

/**
 * 自定义尺寸的入口收敛：夹进合法区间，超面积时等比缩回上限内。
 * 走过这里的尺寸必然能通过 assertCanvasSize，UI 层因此不必再兜异常。
 */
export function clampCustomSize(width: number, height: number): Size {
  const w = clampSide(width)
  const h = clampSide(height)
  const area = w * h
  if (area <= MAX_CANVAS_AREA) {
    return { width: w, height: h }
  }
  const scale = Math.sqrt(MAX_CANVAS_AREA / area)
  return {
    width: Math.max(MIN_CANVAS_SIDE, Math.floor(w * scale)),
    height: Math.max(MIN_CANVAS_SIDE, Math.floor(h * scale)),
  }
}

function clampSide(value: number): number {
  const rounded = Math.round(value)
  return clamp(
    Number.isFinite(rounded) ? rounded : MIN_CANVAS_SIDE,
    MIN_CANVAS_SIDE,
    MAX_CANVAS_SIDE,
  )
}

/**
 * 把权重归一成和为 1 的正数序列：非有限与非正值一律当 0，
 * 全 0 时退化为等分（拖拽切割线过程中必然经过的中间态）。
 */
export function normalizeWeights(values: readonly number[]): number[] {
  const cleaned = values.map((value) => (Number.isFinite(value) && value > 0 ? value : 0))
  if (cleaned.length === 0) {
    return []
  }
  const total = cleaned.reduce((sum, value) => sum + value, 0)
  if (total <= 0) {
    return cleaned.map(() => 1 / cleaned.length)
  }
  return cleaned.map((value) => value / total)
}

/**
 * 两轴各自封顶后，若总格数仍超预算就按比例缩两轴（保形状）。
 * UI 的动态 max 已经会让用户撞不到这里，这条是持久化兜底：
 * localStorage 里可能存着旧上限时代的 10×10。
 */
export function fitTracks(cols: number, rows: number): [number, number] {
  let columns = clamp(Math.round(cols), 1, MAX_TRACKS)
  let rowCount = clamp(Math.round(rows), 1, MAX_TRACKS)
  if (columns * rowCount <= MAX_CELLS) {
    return [columns, rowCount]
  }
  const scale = Math.sqrt(MAX_CELLS / (columns * rowCount))
  columns = Math.max(1, Math.floor(columns * scale))
  rowCount = Math.max(1, Math.floor(rowCount * scale))
  while (columns * rowCount > MAX_CELLS) {
    if (columns >= rowCount) {
      columns -= 1
    } else {
      rowCount -= 1
    }
  }
  return [columns, rowCount]
}

/** 等分网格：cols × rows 个单元格，拼接与拆分的自定义都从这里长出来 */
export function equalGrid(id: string, cols: number, rows: number): GridTemplate {
  const [colCount, rowCount] = fitTracks(cols, rows)
  return {
    id,
    cols: Array.from({ length: colCount }, () => 1 / colCount),
    rows: Array.from({ length: rowCount }, () => 1 / rowCount),
    cells: Array.from({ length: colCount * rowCount }, (_, index) => ({
      col: index % colCount,
      row: Math.floor(index / colCount),
    })),
  }
}

/** 一维自定义的三种形态：横排 = N 列 1 行，竖排 = 1 列 N 行 */
export type GridDirection = 'row' | 'col' | 'grid'

/** 方向不存字段，由行列反推，所以老数据零迁移 */
export function directionOf(cols: number, rows: number): GridDirection {
  if (rows === 1 && cols > 1) {
    return 'row'
  }
  if (cols === 1 && rows > 1) {
    return 'col'
  }
  return 'grid'
}

/** 一维模式下的份数就是较长那一轴 */
export function countOf(cols: number, rows: number): number {
  return Math.max(cols, rows)
}

/** 网格模式下单轴能拖到的顶：受单轴封顶与总格数预算双重约束 */
export function trackMax(otherAxis: number): number {
  return clamp(Math.floor(MAX_CELLS / Math.max(1, otherAxis)), 1, MAX_TRACKS)
}

type Track = { start: number; size: number }

/**
 * 权重 → 轨道位置。snap=true 时边界取整，配合 gap=0/padding=0
 * 可保证拆分切片无缝且不重叠（末块吸收取整误差）。
 */
function buildTracks(
  weights: readonly number[],
  origin: number,
  total: number,
  gap: number,
  snap: boolean,
): Track[] {
  const normalized = normalizeWeights(weights)
  const count = normalized.length
  if (count === 0) {
    return []
  }
  // 间距不得超过每轨均分宽度，否则 avail 变负、轨道互相倒挂
  const safeGap = count > 1 ? Math.min(Math.max(0, gap), Math.max(0, total) / count) : 0
  const avail = Math.max(0, total - safeGap * (count - 1))

  // edges[i] = 第 i 轨的起点，edges[count] 是末轨起点再加一个间距，
  // 这样 size = edges[i+1] - edges[i] - gap 对每一轨都成立
  const edges: number[] = [snap ? Math.round(origin) : origin]
  let used = 0
  for (let index = 0; index < count; index += 1) {
    used += avail * normalized[index]
    const raw =
      index === count - 1 ? origin + avail + safeGap * count : origin + used + safeGap * (index + 1)
    edges.push(snap ? Math.round(raw) : raw)
  }

  return normalized.map((_, index) => ({
    start: edges[index],
    size: Math.max(0, edges[index + 1] - edges[index] - safeGap),
  }))
}

/** 把版式 + 间距求解成 box 坐标系下的单元格矩形，拼接与拆分共用 */
export function resolveCells(
  template: GridTemplate,
  box: Rect,
  spacing: { padding: number; gap: number },
  snap = false,
): Rect[] {
  const half = Math.min(box.width, box.height) / 2
  const padding = clamp(
    Number.isFinite(spacing.padding) ? spacing.padding : 0,
    0,
    Math.max(0, half),
  )
  const colTracks = buildTracks(
    template.cols,
    box.x + padding,
    box.width - padding * 2,
    spacing.gap,
    snap,
  )
  const rowTracks = buildTracks(
    template.rows,
    box.y + padding,
    box.height - padding * 2,
    spacing.gap,
    snap,
  )
  if (colTracks.length === 0 || rowTracks.length === 0) {
    return []
  }

  return template.cells.flatMap((cell) => {
    const firstCol = colTracks[cell.col]
    const lastCol = colTracks[cell.col + Math.max(1, cell.colSpan ?? 1) - 1]
    const firstRow = rowTracks[cell.row]
    const lastRow = rowTracks[cell.row + Math.max(1, cell.rowSpan ?? 1) - 1]
    if (!firstCol || !lastCol || !firstRow || !lastRow) {
      return []
    }
    return [
      {
        x: firstCol.start,
        y: firstRow.start,
        // 跨格要把它跨过的间距一起吃掉，否则拼起来会漏缝
        width: lastCol.start + lastCol.size - firstCol.start,
        height: lastRow.start + lastRow.size - firstRow.start,
      },
    ]
  })
}

/** scene 的单元格矩形（画布像素）：渲染、命中测试、导出同源，避免三处各算一遍 */
export function sceneCells(scene: Scene, snap = false): Rect[] {
  return resolveCells(
    scene.template,
    { x: 0, y: 0, width: scene.canvas.width, height: scene.canvas.height },
    { padding: scene.style.padding, gap: scene.style.gap },
    snap,
  )
}

/** drawImage 的源矩形与目标矩形 */
export type Placement = {
  sx: number
  sy: number
  sw: number
  sh: number
  dx: number
  dy: number
  dw: number
  dh: number
}

const EMPTY_PLACEMENT: Placement = {
  sx: 0,
  sy: 0,
  sw: 0,
  sh: 0,
  dx: 0,
  dy: 0,
  dw: 0,
  dh: 0,
}

/** cover = 铺满单元格并按 focus 裁切；contain = 完整显示并居中留白 */
export function resolvePlacement(
  cell: Rect,
  image: Size,
  layer: { fit: Fit; focus: Focus },
): Placement {
  if (image.width <= 0 || image.height <= 0 || cell.width <= 0 || cell.height <= 0) {
    return { ...EMPTY_PLACEMENT, dx: cell.x, dy: cell.y, dw: cell.width, dh: cell.height }
  }

  if (layer.fit === 'contain') {
    const scale = Math.min(cell.width / image.width, cell.height / image.height)
    const dw = image.width * scale
    const dh = image.height * scale
    return {
      sx: 0,
      sy: 0,
      sw: image.width,
      sh: image.height,
      dx: cell.x + (cell.width - dw) / 2,
      dy: cell.y + (cell.height - dh) / 2,
      dw,
      dh,
    }
  }

  const zoom = clamp(layer.focus.zoom, MIN_ZOOM, MAX_ZOOM)
  const scale = Math.max(cell.width / image.width, cell.height / image.height) * zoom
  const sw = cell.width / scale
  const sh = cell.height / scale
  return {
    sx: clamp01((layer.focus.x + 1) / 2) * (image.width - sw),
    sy: clamp01((layer.focus.y + 1) / 2) * (image.height - sh),
    sw,
    sh,
    dx: cell.x,
    dy: cell.y,
    dw: cell.width,
    dh: cell.height,
  }
}

/** 拖拽平移焦点：dxRatio 为指针位移占单元格显示宽度的比例，拖过半格走完整个行程 */
export function panFocus(focus: Focus, dxRatio: number, dyRatio: number): Focus {
  return {
    ...focus,
    x: clamp(focus.x - dxRatio * 2, -1, 1),
    y: clamp(focus.y - dyRatio * 2, -1, 1),
  }
}

/**
 * 滚轮缩放焦点，并让光标底下的那个图像点保持不动。
 * u / v 是光标在单元格内的位置（0..1）。做法是先算出光标对应的源图像素坐标，
 * 再按新的可见区宽度反解出新的裁切起点。
 */
export function zoomFocus(
  focus: Focus,
  cell: Size,
  image: Size,
  nextZoom: number,
  u: number,
  v: number,
): Focus {
  const zoom = clamp(focus.zoom, MIN_ZOOM, MAX_ZOOM)
  const target = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM)
  if (target === zoom || cell.width <= 0 || cell.height <= 0) {
    return { ...focus, zoom: target }
  }
  const base = Math.max(cell.width / image.width, cell.height / image.height)
  const before = { w: cell.width / (base * zoom), h: cell.height / (base * zoom) }
  const after = { w: cell.width / (base * target), h: cell.height / (base * target) }
  return {
    x: anchorAxis((focus.x + 1) / 2, image.width, before.w, after.w, u),
    y: anchorAxis((focus.y + 1) / 2, image.height, before.h, after.h, v),
    zoom: target,
  }
}

/** 由 t（裁切起点占可裁范围的比例）反解缩放后的新 t，再映射回 [-1,1] */
function anchorAxis(t: number, extent: number, before: number, after: number, u: number): number {
  const slack = extent - before
  const anchor = clamp01(t) * Math.max(0, slack) + clamp01(u) * before
  const nextSlack = extent - after
  if (nextSlack <= 0) {
    return 0
  }
  return clamp(((anchor - clamp01(u) * after) / nextSlack) * 2 - 1, -1, 1)
}

/** 拆前的比例感知裁切：太宽裁左右（居中），太高裁上下（按锚点） */
/**
 * 拆分用的裁切框：先取源图内放得下的最大目标比例框，再按 zoom 收缩、按 focus 平移。
 * focus 与拼接单元格用的是同一套 [-1,1] 语义，所以 panFocus / zoomFocus 能直接复用。
 */
export function cropRectForFocus(source: Size, ratio: number, focus: Focus): Rect {
  const width = Math.max(0, source.width)
  const height = Math.max(0, source.height)
  if (width <= 0 || height <= 0 || !Number.isFinite(ratio) || ratio <= 0) {
    return { x: 0, y: 0, width, height }
  }
  const zoom = clamp(focus.zoom, MIN_ZOOM, MAX_ZOOM)
  const base =
    width / height > ratio ? { width: height * ratio, height } : { width, height: width / ratio }
  const cropWidth = Math.min(width, Math.round(base.width / zoom))
  const cropHeight = Math.min(height, Math.round(base.height / zoom))
  return {
    x: Math.round((width - cropWidth) * clamp01((focus.x + 1) / 2)),
    y: Math.round((height - cropHeight) * clamp01((focus.y + 1) / 2)),
    width: cropWidth,
    height: cropHeight,
  }
}

export function emptyLayer(): GridLayer {
  return { imageId: null, fit: 'cover', focus: { x: 0, y: 0, zoom: 1 } }
}

/**
 * 等比缩放整个 scene：布局是归一化的，所以只要把画布与 px 样式一起乘上系数，
 * 渲染结果就与缩放前几何全等。预览用小尺寸画、导出用原尺寸画，靠这个函数对齐。
 */
export function scaleScene(scene: Scene, scale: number): Scene {
  const factor = Number.isFinite(scale) && scale > 0 ? scale : 1
  return {
    canvas: {
      width: scene.canvas.width * factor,
      height: scene.canvas.height * factor,
    },
    style: {
      ...scene.style,
      padding: scene.style.padding * factor,
      gap: scene.style.gap * factor,
      cellRadius: scene.style.cellRadius * factor,
      canvasRadius: scene.style.canvasRadius * factor,
    },
    template: scene.template,
    layers: scene.layers,
  }
}

export type FittedBox = { scale: number; width: number; height: number }

/** 把 size 等比缩进 availableWidth × maxHeight；容器还没量到时返回 null */
export function fitBox(size: Size, availableWidth: number, maxHeight: number): FittedBox | null {
  if (
    availableWidth <= 0 ||
    maxHeight <= 0 ||
    !Number.isFinite(size.width) ||
    !Number.isFinite(size.height) ||
    size.width <= 0 ||
    size.height <= 0
  ) {
    return null
  }
  const scale = Math.min(availableWidth / size.width, maxHeight / size.height)
  return { scale, width: size.width * scale, height: size.height * scale }
}

/** 图层数对齐模板单元格数：多退少补，保留已有单元格的图与焦点 */
export function resizeLayers(layers: readonly GridLayer[], count: number): GridLayer[] {
  return Array.from({ length: Math.max(0, count) }, (_, index) => layers[index] ?? emptyLayer())
}

/**
 * 按素材顺序自动填满单元格。素材不够时循环复用而不是留空——
 * 版式张数与素材数是两回事，一张图铺满九宫格是常见用法。
 */
export function autoAssign(imageIds: readonly string[], count: number): GridLayer[] {
  const slots = Math.max(0, count)
  if (imageIds.length === 0) {
    return resizeLayers([], slots)
  }
  return Array.from({ length: slots }, (_, index) => ({
    ...emptyLayer(),
    imageId: imageIds[index % imageIds.length],
  }))
}

export function mimeTypeOf(format: ExportFormat): string {
  return format === 'jpeg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png'
}

export function extensionOf(format: ExportFormat): string {
  return format === 'jpeg' ? 'jpg' : format === 'webp' ? 'webp' : 'png'
}

/** 只有 PNG/WebP 存得下 alpha；JPEG 的透明区会变黑 */
export function supportsAlpha(format: ExportFormat): boolean {
  return format !== 'jpeg'
}

function stripExtension(name: string): string {
  return name.replace(/\.[^.]+$/, '')
}

/** 切片命名 `{原名}_{行}-{列}.{ext}`，行列均 1 起 */
export function buildSliceName(
  sourceName: string,
  row: number,
  col: number,
  format: ExportFormat,
): string {
  const base = sanitizeFileName(stripExtension(sourceName), 'image')
  return `${base}_${row + 1}-${col + 1}.${extensionOf(format)}`
}

/**
 * 一批切片的名字。equalGrid 的单元格是行主序（先铺满第一行），
 * 与拆分预览里 CSS Grid 的自动落位顺序一致，所以编号与文件名对得上。
 */
export function buildSliceNames(
  sourceName: string,
  cols: number,
  count: number,
  format: ExportFormat,
): string[] {
  const columns = Math.max(1, Math.round(cols))
  return Array.from({ length: Math.max(0, count) }, (_, index) =>
    buildSliceName(sourceName, Math.floor(index / columns), index % columns, format),
  )
}

export function buildStackFileName(format: ExportFormat, createdAt = Date.now()): string {
  const stamp = new Date(createdAt).toISOString().replace(/[:.]/g, '-').slice(0, 19)
  return `image-stack-${stamp}.${extensionOf(format)}`
}

export function buildSliceZipName(sourceName: string): string {
  return `${sanitizeFileName(stripExtension(sourceName), 'image')}-slices.zip`
}

function readNumber(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : fallback
  return clamp(Math.round(numeric), min, max)
}

/** 样式数值的统一兜底：非有限值归下限，越界截断 */
export function clampStyleBounds(style: SceneStyle): SceneStyle {
  return {
    padding: readNumber(style.padding, 0, 0, MAX_PADDING),
    gap: readNumber(style.gap, 0, 0, MAX_GAP),
    cellRadius: readNumber(style.cellRadius, 0, 0, MAX_RADIUS),
    canvasRadius: readNumber(style.canvasRadius, 0, 0, MAX_RADIUS),
    background: style.background,
  }
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

function readBackground(value: unknown): Background {
  if (typeof value !== 'object' || value === null) {
    return { type: 'color', value: '#ffffff' }
  }
  const candidate = value as { type?: unknown; value?: unknown }
  if (candidate.type === 'transparent') {
    return { type: 'transparent' }
  }
  const color =
    typeof candidate.value === 'string' && HEX_COLOR.test(candidate.value)
      ? candidate.value
      : '#ffffff'
  return { type: 'color', value: color }
}

/** localStorage 可能被手工改坏，读取后逐字段兜底（AGENTS.md §8） */
export function normalizeStyle(raw: unknown): SceneStyle {
  const source = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  return {
    padding: readNumber(source.padding, DEFAULT_STYLE.padding, 0, MAX_PADDING),
    gap: readNumber(source.gap, DEFAULT_STYLE.gap, 0, MAX_GAP),
    cellRadius: readNumber(source.cellRadius, DEFAULT_STYLE.cellRadius, 0, MAX_RADIUS),
    canvasRadius: readNumber(source.canvasRadius, DEFAULT_STYLE.canvasRadius, 0, MAX_RADIUS),
    background: readBackground(source.background),
  }
}

/** 拆分裁切框的平移缩放焦点，与单元格焦点同一套 [-1,1] + zoom 语义 */
export function normalizeFocus(raw: unknown): Focus {
  const source = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  // 焦点是小数比例，不能走 readNumber：那个是给 px 用的，会四舍五入掉亚像素位移
  const decimal = (value: unknown, fallback: number, min: number, max: number) =>
    typeof value === 'number' && Number.isFinite(value) ? clamp(value, min, max) : fallback
  return {
    x: decimal(source.x, 0, -1, 1),
    y: decimal(source.y, 0, -1, 1),
    zoom: decimal(source.zoom, MIN_ZOOM, MIN_ZOOM, MAX_ZOOM),
  }
}

export function normalizeRatioKey(raw: unknown): RatioKey {
  return CANVAS_RATIOS.some((item) => item.key === raw) ? (raw as RatioKey) : DEFAULT_RATIO
}

const FALLBACK_CUSTOM_SIZE: Size = { width: 1080, height: 1080 }

export function normalizeCustomSize(raw: unknown): Size {
  if (typeof raw !== 'object' || raw === null) {
    return FALLBACK_CUSTOM_SIZE
  }
  const source = raw as { width?: unknown; height?: unknown }
  if (typeof source.width !== 'number' || typeof source.height !== 'number') {
    return FALLBACK_CUSTOM_SIZE
  }
  return clampCustomSize(source.width, source.height)
}

export function normalizePresetKey(ratioKey: RatioKey, raw: unknown): string {
  const presets = CANVAS_SIZE_PRESETS[ratioKey] ?? CANVAS_SIZE_PRESETS[DEFAULT_RATIO]
  return presets.some((item) => item.key === raw) || raw === CUSTOM_SIZE_KEY
    ? String(raw)
    : presets[0].key
}

export function normalizeExport(raw: unknown): ExportOption {
  const source = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const format = EXPORT_FORMATS.includes(source.format as ExportFormat)
    ? (source.format as ExportFormat)
    : DEFAULT_EXPORT.format
  return { format, quality: readQuality(source.quality) }
}

/**
 * 质量在 store 与持久化里都是 0.1~1 的小数（UI 的 slider 自己乘 100 显示），
 * 读取时按小数校验，别再当百分数换算，否则 0.92 会被 round 成 1 再夹到下限。
 */
function readQuality(raw: unknown): number {
  const value = typeof raw === 'number' && Number.isFinite(raw) ? raw : DEFAULT_EXPORT.quality
  return Math.min(1, Math.max(0.1, value))
}
