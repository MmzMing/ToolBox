import { isValidBaseUrl, type AIProvider } from '@/modules/ai/providers'
import type { ImageRequestParams } from '@/modules/ai/transport'

export type ApiLike = {
  provider: AIProvider
  apiKey: string
  baseUrl: string
  model: string
}

/** 配置指纹：key/地址/模型任一变化即失效，绿点随之回红 */
export function apiSignature(api: ApiLike): string {
  return [api.provider, api.model.trim(), api.baseUrl.trim(), api.apiKey.trim().slice(-12)].join(
    '|',
  )
}

/** 红/绿状态：未配置为红；配置齐且当前指纹测试通过才绿 */
export function apiReady(api: ApiLike, testedSignature: string): boolean {
  if (!api.apiKey.trim() || !api.model.trim() || !isValidBaseUrl(api.baseUrl)) {
    return false
  }
  return testedSignature === apiSignature(api)
}

/** 只问「填全了没」，不要求连接测试通过：dock 上的设置状态灯用它 */
export function apiConfigured(api: ApiLike): boolean {
  return !!api.apiKey.trim() && !!api.model.trim() && isValidBaseUrl(api.baseUrl)
}

export const ASPECT_KEYS = ['auto', '1:1', '3:2', '2:3', '16:9', '9:16', '4:3', '3:4'] as const
export type AspectKey = (typeof ASPECT_KEYS)[number]

export type Quality = 'auto' | 'low' | 'medium' | 'high'
export type OutputFormat = 'png' | 'jpeg' | 'webp'
export type Background = 'auto' | 'transparent' | 'opaque'
export type ImageSize = '1K' | '2K' | '4K'
export type InputFidelity = 'low' | 'high'

export type GenParams = {
  aspect: AspectKey
  quality: Quality
  count: number
  imageSize: ImageSize
  /** 仅 Gemini 生效；空串表示不锁 seed */
  seed: string
  background: Background
  outputFormat: OutputFormat
  outputCompression: number
  inputFidelity: InputFidelity
}

export const MAX_COUNT = 4
export const MAX_REFERENCE_BYTES = 20 * 1024 * 1024
export const REFERENCE_MIMES: readonly string[] = ['image/png', 'image/jpeg', 'image/webp']

export const defaultGenParams = (): GenParams => ({
  // 默认让服务商自己定比例：带参考图时跟着原图走最不容易出错
  aspect: 'auto',
  quality: 'auto',
  count: 1,
  imageSize: '1K',
  seed: '',
  background: 'auto',
  outputFormat: 'png',
  outputCompression: 100,
  inputFidelity: 'high',
})

/** OpenAI 只吃三档像素尺寸，其余比例就近映射 */
const OPENAI_SIZE: Record<AspectKey, string> = {
  auto: 'auto',
  '1:1': '1024x1024',
  '3:2': '1536x1024',
  '2:3': '1024x1536',
  '16:9': '1536x1024',
  '9:16': '1024x1536',
  '4:3': '1536x1024',
  '3:4': '1024x1536',
}

export const openaiSizeFor = (aspect: AspectKey): string => OPENAI_SIZE[aspect]

const has = <T extends readonly string[]>(list: T, value: unknown): value is T[number] =>
  typeof value === 'string' && (list as readonly string[]).includes(value)

const QUALITIES = ['auto', 'low', 'medium', 'high'] as const
const IMAGE_SIZES = ['1K', '2K', '4K'] as const
const BACKGROUNDS = ['auto', 'transparent', 'opaque'] as const
const OUTPUT_FORMATS = ['png', 'jpeg', 'webp'] as const
const FIDELITIES = ['low', 'high'] as const

/** 只补全与夹紧，不抛错：参数条任何手输都不该让页面崩 */
export function normalizeGenParams(raw: Partial<GenParams> | null | undefined): GenParams {
  const base = defaultGenParams()
  const source = raw ?? {}
  const count = Math.round(Number(source.count))
  const compression = Math.round(Number(source.outputCompression))
  return {
    aspect: has(ASPECT_KEYS, source.aspect) ? source.aspect : base.aspect,
    quality: has(QUALITIES, source.quality) ? source.quality : base.quality,
    count: Number.isFinite(count) ? Math.min(MAX_COUNT, Math.max(1, count)) : base.count,
    imageSize: has(IMAGE_SIZES, source.imageSize) ? source.imageSize : base.imageSize,
    seed: typeof source.seed === 'string' ? source.seed.replace(/[^\d]/g, '').slice(0, 10) : '',
    background: has(BACKGROUNDS, source.background) ? source.background : base.background,
    outputFormat: has(OUTPUT_FORMATS, source.outputFormat)
      ? source.outputFormat
      : base.outputFormat,
    outputCompression: Number.isFinite(compression)
      ? Math.min(100, Math.max(0, compression))
      : base.outputCompression,
    inputFidelity: has(FIDELITIES, source.inputFidelity)
      ? source.inputFidelity
      : base.inputFidelity,
  }
}

/** 画布 overlay：一个 nodeId 一条记录，位置与提示词文本的唯一真相 */
export type CanvasNodeRecord = {
  nodeId: string
  /** 所属工作区；缺失视为历史遗留，归入默认工作区 */
  workspaceId: string
  /** null = 未手动摆过，交给自动分层布局给位 */
  x: number | null
  y: number | null
  /** 非 null 即代表这是一个 prompt 节点 */
  text: string | null
  /** 入边：作为参考图的图片 id */
  refs: string[]
  /** 入边：上游提示词节点 id，生成时按链路顺序拼合 */
  chain: string[]
  /** 手工缩放的尺寸；null = 用该类型节点的默认尺寸 */
  width: number | null
  height: number | null
  /** 文本里第 k 个 @图N 标记绑定的图片 id，见 referenceLabelAt 一节 */
  mentions: string[]
  createdAt: number | null
}

export const CANVAS_TEXT_LIMIT = 4000
export const MAX_CANVAS_REFS = 4
/** 链式拼合的分隔符：空行分段，对自然语言与 tag 两种风格都不会黏字 */
export const CANVAS_PROMPT_JOINER = '\n\n'
/** 工作区概念之前入库的图片与 overlay 归属这里，避免升级后凭空消失 */
export const LEGACY_WORKSPACE_ID = 'legacy'

/** IDB 内容可被手工改坏：逐字段收窄，非法即回落而不是抛错 */
export function normalizeCanvasNode(raw: unknown): CanvasNodeRecord | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }
  const source = raw as Record<string, unknown>
  if (typeof source.nodeId !== 'string' || !source.nodeId) {
    return null
  }
  const coord = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null
  const refs = Array.isArray(source.refs)
    ? [
        ...new Set(
          source.refs.filter((ref): ref is string => typeof ref === 'string' && ref.length > 0),
        ),
      ].slice(0, MAX_CANVAS_REFS)
    : []
  const chain = Array.isArray(source.chain)
    ? [
        ...new Set(
          source.chain.filter(
            (link): link is string =>
              typeof link === 'string' && link.startsWith('p:') && link !== source.nodeId,
          ),
        ),
      ]
    : []
  const width = coord(source.width)
  const height = coord(source.height)
  const size =
    width !== null && height !== null ? clampCanvasSize(source.nodeId, width, height) : null
  const mentions = Array.isArray(source.mentions)
    ? source.mentions
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
        .slice(0, MAX_MENTIONS)
    : []
  return {
    nodeId: source.nodeId,
    workspaceId:
      typeof source.workspaceId === 'string' && source.workspaceId
        ? source.workspaceId
        : LEGACY_WORKSPACE_ID,
    x: coord(source.x),
    y: coord(source.y),
    text: typeof source.text === 'string' ? source.text.slice(0, CANVAS_TEXT_LIMIT) : null,
    refs,
    chain,
    width: size?.width ?? null,
    height: size?.height ?? null,
    mentions,
    createdAt:
      typeof source.createdAt === 'number' && Number.isFinite(source.createdAt)
        ? source.createdAt
        : null,
  }
}

/** 比例串 → 宽高比；auto 与任何非法输入回落 1，节点高度据此预算 */
export const aspectRatioOf = (aspect: string): number => {
  const [width, height] = aspect.split(':').map(Number)
  return width && height && Number.isFinite(width) && Number.isFinite(height) ? width / height : 1
}

/** 画布缩放上下限：ImageCanvas 的 min/maxZoom 与缩放条的缩放按钮共用一份 */
export const CANVAS_MIN_ZOOM = 0.1
export const CANVAS_MAX_ZOOM = 2.5
export const CANVAS_ZOOM_STEP = 1.2

/** 标尺想达到的刻度屏幕间距：太密读不清，太疏对不准 */
export const RULER_TARGET_GAP_PX = 72
/** 刻度间隔只取这几档，读起来才是「整」数 */
const RULER_STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000]

/** 当前缩放下该用多大的画布坐标间隔 */
export function rulerStepOf(zoom: number, targetPx = RULER_TARGET_GAP_PX): number {
  const flow = targetPx / Math.max(zoom, 0.01)
  return RULER_STEPS.find((step) => step >= flow) ?? RULER_STEPS[RULER_STEPS.length - 1]
}

/** [from, to] 之间所有 step 的整数倍，含两端；空区间即空数组 */
export function rulerTicksOf(from: number, to: number, step: number): number[] {
  if (!(step > 0) || to < from) {
    return []
  }
  const first = Math.ceil(from / step)
  const last = Math.floor(to / step)
  return Array.from({ length: Math.max(0, last - first + 1) }, (_, index) => (first + index) * step)
}

/** 撤销栈深度：再深也只是堆内存里的 overlay 快照，没必要留那么多 */
export const HISTORY_LIMIT = 50

export const CANVAS_IMAGE_WIDTH = 240
export const CANVAS_PROMPT_WIDTH = 260
export const CANVAS_PROMPT_HEIGHT = 150
export const CANVAS_GAP_X = 96
export const CANVAS_GAP_Y = 24
export const CANVAS_ORIGIN_Y = 0

/** 手工缩放的范围：宽度两端共用，提示词节点的高度必须封顶，否则长文本会把画布拉爆 */
export const CANVAS_NODE_MIN_WIDTH = 160
export const CANVAS_NODE_MAX_WIDTH = 720
export const CANVAS_NODE_MIN_HEIGHT = 120
export const CANVAS_NODE_MAX_HEIGHT = 720
export const CANVAS_PROMPT_MAX_HEIGHT = 560

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

/** 缩放手柄松手后的落库值：按节点类型夹紧并取整，图片节点的高度上限跟着宽度走 */
export function clampCanvasSize(nodeId: string, width: number, height: number) {
  const maxHeight = nodeId.startsWith('p:') ? CANVAS_PROMPT_MAX_HEIGHT : CANVAS_NODE_MAX_HEIGHT
  return {
    width: Math.round(clamp(width, CANVAS_NODE_MIN_WIDTH, CANVAS_NODE_MAX_WIDTH)),
    height: Math.round(clamp(height, CANVAS_NODE_MIN_HEIGHT, maxHeight)),
  }
}

/** 一次生成 = 一个 prompt 节点，id 直接由 jobId 派生，位置与入边因此零重映射 */
export const promptNodeIdOf = (jobId: string): string => `p:${jobId}`
export const jobIdOfPromptNode = (nodeId: string): string => nodeId.slice(2)

export type NodeBounds = {
  id: string
  x: number
  y: number
  width: number
  height: number
}

/** 多选时浮出的重排条要贴着选框，包围盒由这批节点算出 */
export function boundingBoxOf(nodes: NodeBounds[]) {
  const left = Math.min(...nodes.map((node) => node.x))
  const right = Math.max(...nodes.map((node) => node.x + node.width))
  const top = Math.min(...nodes.map((node) => node.y))
  const bottom = Math.max(...nodes.map((node) => node.y + node.height))
  return { left, top, right, bottom, width: right - left, height: bottom - top }
}

/** 对齐容差：按屏幕像素给，调用方除以缩放换算成画布单位，缩得再小也是那 6 个像素的手感 */
export const ALIGN_TOLERANCE_PX = 6

/**
 * 一条对齐线：axis 沿用参考线的约定，x 是竖线、y 是横线。
 * from / to 是它在另一根轴上的跨度，只盖住对齐的那两张卡片，不铺满视口。
 */
export type AlignLine = { axis: 'x' | 'y'; pos: number; from: number; to: number }

type Box = { left: number; top: number; right: number; bottom: number }

/** 矩形在某轴上的三条候选位：两条边与中心 */
function axisEdges(axis: 'x' | 'y', box: Box) {
  return axis === 'x'
    ? [box.left, box.right, (box.left + box.right) / 2]
    : [box.top, box.bottom, (box.top + box.bottom) / 2]
}

/** 两张卡片在另一根轴上的并集，即对齐线该画多长 */
function axisSpan(axis: 'x' | 'y', a: Box, b: Box) {
  return axis === 'x'
    ? { from: Math.min(a.top, b.top), to: Math.max(a.bottom, b.bottom) }
    : { from: Math.min(a.left, b.left), to: Math.max(a.right, b.right) }
}

/**
 * 拖动的框（可以是一批）与其余节点的边、中心两两比对，落在容差内即出一条对齐线。
 * 只报线不改位置：吸走节点会让手感变怪，用户要的是「现在正对着」这件事被看见。
 * 同一轴上多个节点本就并排时只留一条并把跨度拉长，免得叠出重影。
 * 线位钉在静止节点的边上而不是两边中点：取中点会让线跟着手指每帧滑，容差内看着就在抖。
 */
export function alignLinesOf(
  dragged: NodeBounds[],
  others: NodeBounds[],
  tolerance: number,
): AlignLine[] {
  if (!dragged.length || !others.length) {
    return []
  }
  const moving = boundingBoxOf(dragged)
  const out: AlignLine[] = []
  for (const axis of ['x', 'y'] as const) {
    for (const value of axisEdges(axis, moving)) {
      for (const node of others) {
        const target = boundingBoxOf([node])
        for (const edge of axisEdges(axis, target)) {
          if (Math.abs(value - edge) > tolerance) {
            continue
          }
          const span = axisSpan(axis, moving, target)
          const hit = out.find(
            (line) => line.axis === axis && Math.abs(line.pos - edge) <= tolerance,
          )
          if (hit) {
            hit.from = Math.min(hit.from, span.from)
            hit.to = Math.max(hit.to, span.to)
            continue
          }
          out.push({ axis, pos: edge, ...span })
        }
      }
    }
  }
  return out
}

/** 提及标记的上限：同一张图可以反复 @，但手改坏的记录不能把 IDB 撑爆 */
export const MAX_MENTIONS = 32

const ZH_LABELS = ['图一', '图二', '图三', '图四']

/**
 * 参考图的编号词。编号就是 refs 里的下标，所以它必须与发给 API 的图片顺序同源；
 * 上限固定 4 张，词表写死，不做通用数字转换。
 */
export function referenceLabelAt(index: number, lang: string): string {
  if (index < 0) return ZH_LABELS[0]
  return lang.startsWith('zh') ? (ZH_LABELS[index] ?? String(index + 1)) : `Image ${index + 1}`
}

/** 解析时两种语言都认：中途切换界面语言不会让既有标记失效 */
export const ALL_REFERENCE_LABELS: string[] = [
  ...ZH_LABELS,
  ...Array.from({ length: MAX_CANVAS_REFS }, (_, index) => `Image ${index + 1}`),
]

export type MentionToken = { label: string; start: number; end: number }

/**
 * 一个提示词节点真正能用的参考图：图片还在，且不是它自己的产出。
 * 顺序即发给 API 的图片顺序，所以 @图N 的编号与出图请求都必须走这条规则，两处共用一个实现。
 */
export function usableReferenceIds(
  refs: string[],
  resolve: (id: string) => { jobId: string } | undefined,
  jobId: string,
): string[] {
  return refs.filter((ref) => {
    const source = resolve(ref)
    return source !== undefined && source.jobId !== jobId
  })
}

/** 按出现顺序扫出文本里所有 @图N 标记 */
export function parseReferenceMentions(
  text: string,
  labels: string[] = ALL_REFERENCE_LABELS,
): MentionToken[] {
  const tokens: MentionToken[] = []
  for (const label of labels) {
    const needle = `@${label}`
    let from = text.indexOf(needle)
    while (from >= 0) {
      tokens.push({ label, start: from, end: from + needle.length })
      from = text.indexOf(needle, from + needle.length)
    }
  }
  return tokens.sort((a, b) => a.start - b.start)
}

export type MentionBinding = MentionToken & { imageId: string }

/**
 * 标记与绑定表按出现顺序逐位配对。多出来的绑定（用户手删了标记）丢弃，
 * 多出来的标记（用户自己打的字）不属于本机制，原样保留。
 */
export function zipReferenceMentions(text: string, mentions: string[]): MentionBinding[] {
  return parseReferenceMentions(text)
    .slice(0, mentions.length)
    .map((token, index) => ({ ...token, imageId: mentions[index] }))
}

/**
 * 参考图顺序变了就把标记重写成当前编号；图片断开后编号已无处可指，
 * 留着只会让模型把 @图二 认成另一张图，所以连同文字一起摘掉。
 */
export function remapReferenceMentions(input: {
  text: string
  mentions: string[]
  refs: string[]
  lang: string
}): { text: string; mentions: string[] } {
  const bindings = zipReferenceMentions(input.text, input.mentions)
  const kept: string[] = []
  const edits: { start: number; end: number; insert: string }[] = []
  for (const binding of bindings) {
    const index = input.refs.indexOf(binding.imageId)
    if (index < 0) {
      edits.push({ start: binding.start, end: binding.end, insert: '' })
      continue
    }
    const next = `@${referenceLabelAt(index, input.lang)}`
    if (next !== input.text.slice(binding.start, binding.end)) {
      edits.push({ start: binding.start, end: binding.end, insert: next })
    }
    kept.push(binding.imageId)
  }
  let text = input.text
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    text = text.slice(0, edit.start) + edit.insert + text.slice(edit.end)
  }
  return { text, mentions: kept }
}

/**
 * 在光标处插入一个提及：`[start, end)` 是待替换的 @ 片段（含刚打的 @）。
 * 绑定表按出现顺序记录，所以要插到第 k 个位置而不是追加到末尾。
 */
export function insertReferenceMention(input: {
  text: string
  mentions: string[]
  refs: string[]
  imageId: string
  start: number
  end: number
  lang: string
}): { text: string; mentions: string[]; caret: number } {
  const index = input.refs.indexOf(input.imageId)
  if (index < 0 || input.mentions.length >= MAX_MENTIONS) {
    return { text: input.text, mentions: input.mentions, caret: input.end }
  }
  const token = `@${referenceLabelAt(index, input.lang)}`
  const earlier = parseReferenceMentions(input.text).filter((found) => found.end <= input.start)
  const mentions = [...input.mentions]
  mentions.splice(earlier.length, 0, input.imageId)
  return {
    text: `${input.text.slice(0, input.start)}${token} ${input.text.slice(input.end)}`,
    mentions,
    caret: input.start + token.length + 1,
  }
}

export type CanvasImageInput = {
  id: string
  jobId: string
  prompt: string
  createdAt: number
  ratio: number
  /** 从本地拖入/上传的图片：没有生成来源，因此不配 prompt 节点 */
  imported?: boolean
}

export type CanvasBox = { x: number; y: number; width: number; height: number }

export type CanvasNode =
  | (CanvasBox & {
      kind: 'image'
      id: string
      imageId: string
      jobId: string
      createdAt: number
      ratio: number
      pinned: boolean
    })
  | (CanvasBox & {
      kind: 'prompt'
      id: string
      jobId: string
      text: string
      /** 已校验的参考图，顺序即发给 API 的图片顺序，@图N 的编号由它算 */
      refs: string[]
      /** 上游提示词节点 id，生成时按链路顺序拼进最终提示词 */
      chain: string[]
      /** 文本里 @图N 标记绑定的图片 id，按出现顺序 */
      mentions: string[]
      createdAt: number
      /** false = IDB 无 text 记录，由该 job 的历史图片合成 */
      persisted: boolean
      pinned: boolean
    })

export type CanvasEdge = {
  id: string
  source: string
  target: string
  kind: 'reference' | 'output' | 'chain'
}

export type CanvasGraph = {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
}

const boxIntersects = (a: CanvasBox, b: CanvasBox): boolean =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y

/** 图片节点在给定宽度下的高度：等比推导，供布局与识图落位共用 */
export const imageHeightOf = (ratio: number, width: number): number =>
  Math.round(ratio > 0 ? width / ratio : width)

const SLOT_PROBE_LIMIT = 400

/** 从 slot 起点沿 y 向下步进，取第一个不与已占包围盒相交的落点 */
export function findFreeSlot(slot: CanvasBox, occupied: CanvasBox[]): { x: number; y: number } {
  const step = slot.height + CANVAS_GAP_Y
  let y = slot.y
  for (let probe = 0; probe < SLOT_PROBE_LIMIT; probe++) {
    const box: CanvasBox = { ...slot, y }
    if (!occupied.some((other) => boxIntersects(box, other))) {
      return { x: slot.x, y }
    }
    y += step
  }
  return { x: slot.x, y }
}

/** 新增 source→target 边是否会成环：等价于 target 沿现有边能否走回 source */
export function wouldCreateCycle(
  edges: { source: string; target: string }[],
  source: string,
  target: string,
): boolean {
  if (source === target) {
    return true
  }
  const outgoing = new Map<string, string[]>()
  for (const edge of edges) {
    const bucket = outgoing.get(edge.source)
    if (bucket) {
      bucket.push(edge.target)
    } else {
      outgoing.set(edge.source, [edge.target])
    }
  }
  const seen = new Set<string>([target])
  const queue: string[] = [target]
  while (queue.length) {
    const node = queue.shift()
    if (node === undefined) {
      continue
    }
    if (node === source) {
      return true
    }
    for (const next of outgoing.get(node) ?? []) {
      if (!seen.has(next)) {
        seen.add(next)
        queue.push(next)
      }
    }
  }
  return false
}

/**
 * 画布的唯一图来源：图片 + overlay → 节点与边。
 * prompt 节点 id 恒为 `p:${jobId}`，因此连线位置在生成前后不需要重映射。
 */
export function buildCanvasGraph(
  images: CanvasImageInput[],
  overlays: CanvasNodeRecord[],
): CanvasGraph {
  const overlayById = new Map(overlays.map((record) => [record.nodeId, record]))
  const imageById = new Map(images.map((image) => [image.id, image]))
  const imagesByJob = new Map<string, CanvasImageInput[]>()
  for (const image of images) {
    // 导入图没有生成来源：不进 job 聚合，因此不会凭空长出一个 prompt 节点
    if (image.imported) {
      continue
    }
    const bucket = imagesByJob.get(image.jobId)
    if (bucket) {
      bucket.push(image)
    } else {
      imagesByJob.set(image.jobId, [image])
    }
  }
  const earliest = (list: CanvasImageInput[]) =>
    [...list].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))[0]

  const jobIds = new Set<string>(imagesByJob.keys())
  for (const record of overlays) {
    if (record.text !== null && record.nodeId.startsWith('p:')) {
      jobIds.add(record.nodeId.slice(2))
    }
  }

  const promptLinks = new Map<string, { refs: string[]; chain: string[] }>()
  const nodes: CanvasNode[] = []
  for (const jobId of jobIds) {
    const nodeId = promptNodeIdOf(jobId)
    const record = overlayById.get(nodeId)
    const outputs = imagesByJob.get(jobId) ?? []
    if (!record || record.text === null) {
      if (!outputs.length) {
        continue
      }
      promptLinks.set(nodeId, { refs: [], chain: [] })
    } else {
      promptLinks.set(nodeId, { refs: record.refs, chain: record.chain })
    }
  }

  const deps = new Map<string, string[]>()
  const edges: CanvasEdge[] = []
  /** 每个提示词节点真正能用的参考图：图片还在、且不是自己的产出 */
  const validRefs = new Map<string, string[]>()
  for (const [nodeId, links] of promptLinks) {
    const jobId = jobIdOfPromptNode(nodeId)
    const valid = usableReferenceIds(links.refs, (ref) => imageById.get(ref), jobId)
    validRefs.set(nodeId, valid)
    const chain = links.chain.filter((link) => link !== nodeId && promptLinks.has(link))
    deps.set(nodeId, [...valid, ...chain])
    for (const ref of valid) {
      edges.push({ id: `ref:${ref}>${nodeId}`, source: ref, target: nodeId, kind: 'reference' })
    }
    for (const upstream of chain) {
      edges.push({
        id: `chain:${upstream}>${nodeId}`,
        source: upstream,
        target: nodeId,
        kind: 'chain',
      })
    }
    for (const image of imagesByJob.get(jobId) ?? []) {
      edges.push({
        id: `out:${nodeId}>${image.id}`,
        source: nodeId,
        target: image.id,
        kind: 'output',
      })
      deps.set(image.id, [nodeId])
    }
  }

  for (const image of images) {
    const record = overlayById.get(image.id)
    const pinned = record?.x != null && record?.y != null
    const width = record?.width ?? CANVAS_IMAGE_WIDTH
    nodes.push({
      kind: 'image',
      id: image.id,
      imageId: image.id,
      jobId: image.jobId,
      createdAt: image.createdAt,
      ratio: image.ratio,
      x: pinned ? (record?.x as number) : 0,
      y: pinned ? (record?.y as number) : 0,
      width,
      height: record?.height ?? imageHeightOf(image.ratio, width),
      pinned,
    })
  }
  for (const nodeId of promptLinks.keys()) {
    const jobId = jobIdOfPromptNode(nodeId)
    const record = overlayById.get(nodeId)
    const outputs = imagesByJob.get(jobId) ?? []
    const first = outputs.length ? earliest(outputs) : undefined
    const pinned = record?.x != null && record?.y != null
    nodes.push({
      kind: 'prompt',
      id: nodeId,
      jobId,
      text: record?.text ?? first?.prompt ?? '',
      refs: validRefs.get(nodeId) ?? [],
      chain: record?.chain ?? [],
      mentions: record?.mentions ?? [],
      createdAt: record?.createdAt ?? first?.createdAt ?? 0,
      x: pinned ? (record?.x as number) : 0,
      y: pinned ? (record?.y as number) : 0,
      width: record?.width ?? CANVAS_PROMPT_WIDTH,
      height: record?.height ?? CANVAS_PROMPT_HEIGHT,
      persisted: record?.text != null,
      pinned,
    })
  }

  // 拓扑分层：手改过的 IDB 可能造出互引，进环即按 0 层断开而不是无限递归
  const layers = new Map<string, number>()
  const visiting = new Set<string>()
  const layerOf = (nodeId: string): number => {
    const known = layers.get(nodeId)
    if (known !== undefined) {
      return known
    }
    if (visiting.has(nodeId)) {
      return 0
    }
    visiting.add(nodeId)
    const upstream = deps.get(nodeId) ?? []
    const value = upstream.length ? Math.max(...upstream.map(layerOf)) + 1 : 0
    visiting.delete(nodeId)
    layers.set(nodeId, value)
    return value
  }
  for (const node of nodes) {
    layerOf(node.id)
  }

  const columnWidth = new Map<number, number>()
  for (const node of nodes) {
    const layer = layers.get(node.id) ?? 0
    columnWidth.set(layer, Math.max(columnWidth.get(layer) ?? 0, node.width))
  }
  const columnX = new Map<number, number>()
  for (const layer of [...columnWidth.keys()].sort((a, b) => a - b)) {
    const previous = columnX.get(layer - 1)
    columnX.set(
      layer,
      previous === undefined ? 0 : previous + (columnWidth.get(layer - 1) ?? 0) + CANVAS_GAP_X,
    )
  }

  const occupied: CanvasBox[] = []
  for (const node of nodes) {
    if (node.pinned) {
      occupied.push(node)
    }
  }
  const byLayerThenTime = (a: CanvasNode, b: CanvasNode): number =>
    (layers.get(a.id) ?? 0) - (layers.get(b.id) ?? 0) ||
    a.createdAt - b.createdAt ||
    a.id.localeCompare(b.id)
  for (const node of nodes.filter((item) => !item.pinned).sort(byLayerThenTime)) {
    const spot = findFreeSlot(
      {
        x: columnX.get(layers.get(node.id) ?? 0) ?? 0,
        y: CANVAS_ORIGIN_Y,
        width: node.width,
        height: node.height,
      },
      occupied,
    )
    node.x = spot.x
    node.y = spot.y
    occupied.push(node)
  }
  nodes.sort(byLayerThenTime)

  return { nodes, edges }
}

/**
 * 沿 chain 自根向叶拼出最终提示词：先按层深再按创建时间定序，保证上游永远排在下游前面。
 * 只走 prompt 节点，参考图不参与拼合。
 */
export function composePromptText(graph: CanvasGraph, nodeId: string): string {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]))
  const self = byId.get(nodeId)
  if (!self || self.kind !== 'prompt') {
    return ''
  }
  const upstreamOf = (id: string): string[] => {
    const node = byId.get(id)
    if (!node || node.kind !== 'prompt') {
      return []
    }
    return node.chain.filter((link) => link !== id && byId.get(link)?.kind === 'prompt')
  }

  const depth = new Map<string, number>()
  const walking = new Set<string>()
  const depthOf = (id: string): number => {
    const known = depth.get(id)
    if (known !== undefined) {
      return known
    }
    if (walking.has(id)) {
      return 0
    }
    walking.add(id)
    const upstream = upstreamOf(id)
    const value = upstream.length ? Math.max(...upstream.map(depthOf)) + 1 : 0
    walking.delete(id)
    depth.set(id, value)
    return value
  }

  const ancestors = new Set<string>()
  const stack = [...upstreamOf(nodeId)]
  while (stack.length) {
    const id = stack.pop()
    if (id === undefined || id === nodeId || ancestors.has(id)) {
      continue
    }
    ancestors.add(id)
    stack.push(...upstreamOf(id))
  }

  const ordered = [...ancestors].sort(
    (a, b) =>
      depthOf(a) - depthOf(b) ||
      (byId.get(a)?.createdAt ?? 0) - (byId.get(b)?.createdAt ?? 0) ||
      a.localeCompare(b),
  )
  const textOf = (id: string): string => {
    const node = byId.get(id)
    return node && node.kind === 'prompt' ? node.text.trim() : ''
  }
  return [...ordered.map(textOf), self.text.trim()].filter(Boolean).join(CANVAS_PROMPT_JOINER)
}

export type CanvasMapRect = {
  x: number
  y: number
  width: number
  height: number
}

/** 落快照前的形状：尺寸可能还没量出来，交给 buildCanvasMap 兜成默认节点宽 */
export type CanvasMapInput = { x: number; y: number; width?: number; height?: number }

export type WorkspaceInput = {
  id: string
  name: string
  /** 上次访问时的画布布局快照，左上角工作区地图照着它画 */
  map: CanvasMapRect[]
  createdAt: number
  updatedAt: number
}

export type WorkspaceImageInput = { workspaceId?: string; jobId: string }
export type WorkspaceJobInput = { workspaceId?: string; active: boolean }

export type WorkspaceSummary = WorkspaceInput & {
  imageCount: number
  jobCount: number
  activeCount: number
}

const ownerOf = (workspaceId: string | undefined): string => workspaceId || LEGACY_WORKSPACE_ID

/** 工作区地图的数据源：只算数量不碰图片，缩略图另有 map 快照 */
export function summarizeWorkspaces(
  workspaces: WorkspaceInput[],
  images: WorkspaceImageInput[],
  jobs: WorkspaceJobInput[],
): WorkspaceSummary[] {
  const stats = new Map<string, { imageCount: number; jobIds: Set<string>; activeCount: number }>()
  for (const workspace of workspaces) {
    stats.set(workspace.id, { imageCount: 0, jobIds: new Set(), activeCount: 0 })
  }
  for (const image of images) {
    const bucket = stats.get(ownerOf(image.workspaceId))
    if (!bucket) {
      continue
    }
    bucket.imageCount += 1
    bucket.jobIds.add(image.jobId)
  }
  for (const job of jobs) {
    const bucket = stats.get(ownerOf(job.workspaceId))
    if (bucket && job.active) {
      bucket.activeCount += 1
    }
  }
  return workspaces.map((workspace) => {
    const bucket = stats.get(workspace.id)
    return {
      ...workspace,
      imageCount: bucket?.imageCount ?? 0,
      jobCount: bucket?.jobIds.size ?? 0,
      activeCount: bucket?.activeCount ?? 0,
    }
  })
}

/** 快照条数上限：再多也缩不出可辨认的形状，只留前排节点 */
export const CANVAS_MAP_LIMIT = 140

const mapCoord = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null

/**
 * 画布节点 → 地图矩形。写库前与读库后都过它一遍：IDB 内容可能被手工改坏，
 * 而非有限数一旦进了 SVG 的 viewBox，整张地图都画不出来。
 */
export function buildCanvasMap(raw: unknown): CanvasMapRect[] {
  if (!Array.isArray(raw)) {
    return []
  }
  const out: CanvasMapRect[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') {
      continue
    }
    const source = item as Record<string, unknown>
    const x = mapCoord(source.x)
    const y = mapCoord(source.y)
    if (x === null || y === null) {
      continue
    }
    out.push({
      x,
      y,
      width: mapCoord(source.width) ?? CANVAS_IMAGE_WIDTH,
      height: mapCoord(source.height) ?? CANVAS_IMAGE_WIDTH,
    })
    if (out.length >= CANVAS_MAP_LIMIT) {
      break
    }
  }
  return out
}

/**
 * 地图取景框：节点并集外扩一圈留白，空画布返回 null 交给调用方画占位。
 * pad 一并给出，调用方减回去就是节点并集本身（缩略图上那圈虚线外接框）。
 */
export function canvasMapBox(rects: CanvasMapRect[]) {
  if (!rects.length) {
    return null
  }
  const left = Math.min(...rects.map((rect) => rect.x))
  const top = Math.min(...rects.map((rect) => rect.y))
  const right = Math.max(...rects.map((rect) => rect.x + rect.width))
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height))
  const pad = Math.max(48, Math.max(right - left, bottom - top) * 0.06)
  return {
    x: left - pad,
    y: top - pad,
    width: right - left + pad * 2,
    height: bottom - top + pad * 2,
    pad,
  }
}

/** 工作区名上限：改坏的数据截回可用长度，不让超长名称撑破地图卡片 */
export const WORKSPACE_NAME_LIMIT = 60

/** 逐字段兜底：老版本记录没有 map 字段，名称与时间戳也可能被手工改坏 */
export function normalizeWorkspace(raw: unknown): WorkspaceInput | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }
  const source = raw as Record<string, unknown>
  if (typeof source.id !== 'string' || !source.id) {
    return null
  }
  const time = (value: unknown): number =>
    typeof value === 'number' && Number.isFinite(value) ? value : Date.now()
  return {
    id: source.id,
    name: typeof source.name === 'string' ? source.name.slice(0, WORKSPACE_NAME_LIMIT) : '',
    map: buildCanvasMap(source.map),
    createdAt: time(source.createdAt),
    updatedAt: time(source.updatedAt),
  }
}

/** 自动命名的序号：取已有名称尾部数字的最大值加一，删掉中间那个也不会撞名 */
export function nextWorkspaceNumber(names: string[]): number {
  let max = 0
  for (const name of names) {
    const matched = /(\d+)\s*$/.exec(name)
    const value = matched ? Number(matched[1]) : 0
    if (value > max) {
      max = value
    }
  }
  return max + 1
}

export function toImageRequestParams(
  provider: 'openai' | 'gemini',
  params: GenParams,
): ImageRequestParams {
  if (provider === 'openai') {
    return {
      count: params.count,
      size: openaiSizeFor(params.aspect),
      quality: params.quality,
      background: params.background,
      outputFormat: params.outputFormat,
      outputCompression: params.outputFormat === 'png' ? null : params.outputCompression,
      inputFidelity: params.inputFidelity,
    }
  }
  const seed = /^\d+$/.test(params.seed) ? Number(params.seed) : null
  return {
    count: params.count,
    aspectRatio: params.aspect === 'auto' ? undefined : params.aspect,
    imageSize: params.imageSize,
    seed,
  }
}

/** 反推输出解析：JSON 数组（含围栏）优先，退化为按行取候选；对象候选序列化成可读 JSON */
export function parsePromptCandidates(text: string): string[] {
  const trimmed = text.trim()
  const collected: unknown[] = []
  const payloads = [
    trimmed,
    trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1],
    trimmed.match(/\[[\s\S]*\]/)?.[0],
  ]
  for (const payload of payloads) {
    if (!payload) {
      continue
    }
    try {
      const parsed: unknown = JSON.parse(payload)
      if (Array.isArray(parsed)) {
        collected.push(...parsed)
        break
      }
    } catch {
      // 换下一种剥法
    }
  }
  if (!collected.length) {
    collected.push(
      ...trimmed
        .split(/\n+/)
        .map((line) => line.replace(/^\s*(?:\d+[.)]|[-*])\s*/, '').trim())
        .filter((line) => line.length >= 8),
    )
  }
  const out: string[] = []
  for (const item of collected) {
    const value = typeof item === 'string' ? item.trim() : JSON.stringify(item, null, 2)
    if (value && !out.includes(value)) {
      out.push(value)
    }
  }
  return out.slice(0, 6)
}

/**
 * 润色的系统指令：要做什么由用户在节点底部现写，这里只钉死不能动的护栏。
 * 提及标记一旦改动，画布上的参考图就会指错，所以它写成硬约束而不是建议。
 */
export function polishSystemPrompt(lang: 'zh' | 'en', instruction: string): string {
  const guard =
    lang === 'zh'
      ? '硬性要求：原样保留所有 @图N 标记（不增删、不改编号、不换位置的字面量）、保留原有分段与小标题、' +
        '保持中文。只输出结果正文，不要解释、不要前后缀、不要代码围栏。'
      : 'Hard rules: keep every @Image N mention verbatim (same marker, same number, none added or removed), ' +
        'keep the existing paragraph breaks and section headings, and answer in English. ' +
        'Output only the result with no explanation and no code fences.'
  return `${instruction.trim()}\n\n${guard}`
}

/**
 * 自定义识图指令：用户在图片卡片上写了什么就以它为准，不再套 skill 的四候选 JSON 契约，
 * 只补一句收口，免得模型把答案包进围栏或加一段前言。
 */
export function visionInstructionPrompt(lang: 'zh' | 'en', instruction: string): string {
  return lang === 'zh'
    ? `${instruction.trim()}\n\n直接给出结果正文，不要解释你做了什么，不要代码围栏。`
    : `${instruction.trim()}\n\nAnswer with the result only — no preamble about what you did, no code fences.`
}

/** 剥掉模型爱加的 ``` 围栏与「润色后：」这类前言，只留正文 */
export function normalizePolishedText(raw: string): string {
  const unfenced = raw.replace(/^\s*```[a-z]*\s*\n?/i, '').replace(/\n?```\s*$/i, '')
  return unfenced
    .split('\n')
    .filter(
      (line, index) =>
        index !== 0 || !/^\s*(?:【)?(?:润色后|润色结果|polished|result)[：:]?\s*$/i.test(line),
    )
    .join('\n')
    .trim()
}
