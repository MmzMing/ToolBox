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

/** 红/绿状态：未开启或未配置为红；配置齐且当前指纹测试通过才绿 */
export function apiReady(api: ApiLike, enabled: boolean, testedSignature: string): boolean {
  if (!enabled || !api.apiKey.trim() || !api.model.trim() || !isValidBaseUrl(api.baseUrl)) {
    return false
  }
  return testedSignature === apiSignature(api)
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
  aspect: '1:1',
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
  /** 识图取词节点：连入的图片只读、不进生图参考 */
  vision: boolean
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
    vision: source.vision === true,
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

/** 画布缩放上下限：ImageCanvas 的 min/maxZoom 与 dock 的缩放按钮共用一份 */
export const CANVAS_MIN_ZOOM = 0.1
export const CANVAS_MAX_ZOOM = 2.5
export const CANVAS_ZOOM_STEP = 1.2

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
      /** 识图取词节点的原图：只读展示，不会作为生图参考图送出去 */
      vision: boolean
      pinned: boolean
    })
  | (CanvasBox & {
      kind: 'prompt'
      id: string
      jobId: string
      text: string
      refs: string[]
      /** 上游提示词节点 id，生成时按链路顺序拼进最终提示词 */
      chain: string[]
      createdAt: number
      /** false = IDB 无 text 记录，由该 job 的历史图片合成 */
      persisted: boolean
      /** 由图片识别得来的提示词：不给生图入口，连入的图片也不进参考 */
      vision: boolean
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
  for (const [nodeId, links] of promptLinks) {
    const jobId = jobIdOfPromptNode(nodeId)
    const valid = links.refs.filter((ref) => {
      const source = imageById.get(ref)
      return source !== undefined && source.jobId !== jobId
    })
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

  /** 识图取词节点连入的图片：只读展示，不参与下一次生图的参考图 */
  const visionSourceIds = new Set(
    overlays.filter((record) => record.vision).flatMap((record) => record.refs),
  )

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
      vision: visionSourceIds.has(image.id),
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
      refs: promptLinks.get(nodeId)?.refs ?? [],
      chain: record?.chain ?? [],
      createdAt: record?.createdAt ?? first?.createdAt ?? 0,
      x: pinned ? (record?.x as number) : 0,
      y: pinned ? (record?.y as number) : 0,
      width: record?.width ?? CANVAS_PROMPT_WIDTH,
      height: record?.height ?? CANVAS_PROMPT_HEIGHT,
      persisted: record?.text != null,
      vision: record?.vision ?? false,
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

export type WorkspaceInput = {
  id: string
  name: string
  description: string
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

/** 工作区列表卡片的数据源：只算数量不碰图片，卡片因此不需要缩略图 */
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
