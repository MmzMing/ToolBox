import { ulid } from 'ulid'

import {
  AI_PROVIDER_DEFINITIONS,
  DEFAULT_IMAGE_MODEL,
  isModelConfigured,
  toAIConnection,
  type AIConnection,
} from '@/modules/ai/providers'
import {
  AIRequestError,
  requestAIImages,
  requestAIText,
  type ImageGenerationResult,
} from '@/modules/ai/transport'
import { bytesToDataUrl, dataUrlToBytes } from '@/utils/base64'
import { selectEvictIds } from '@/utils/lru'

import {
  aspectRatioOf,
  buildCanvasGraph,
  buildCanvasMap,
  CANVAS_GAP_X,
  CANVAS_GAP_Y,
  CANVAS_IMAGE_WIDTH,
  CANVAS_PROMPT_HEIGHT,
  CANVAS_PROMPT_JOINER,
  clampCanvasSize,
  composePromptText,
  defaultGenParams,
  imageHeightOf,
  jobIdOfPromptNode,
  LEGACY_WORKSPACE_ID,
  MAX_REFERENCE_BYTES,
  parsePromptCandidates,
  promptNodeIdOf,
  REFERENCE_MIMES,
  remapReferenceMentions,
  toImageRequestParams,
  usableReferenceIds,
  type CanvasGraph,
  type CanvasImageInput,
  type CanvasMapInput,
  type CanvasNodeRecord,
  type GenParams,
} from './ai-image-gen.service'
import {
  deleteCanvasNode,
  deleteCanvasNodesOfWorkspace,
  deleteImage,
  deleteImagesOfWorkspace,
  deleteWorkspace as deleteWorkspaceRecord,
  getImage,
  IMAGE_LIMIT,
  imageStats,
  isIdbAvailable,
  listCanvasNodes,
  listImages,
  listPrompts,
  listWorkspaces,
  putCanvasNode,
  putCanvasNodes,
  putImage,
  putWorkspace,
  upsertPrompt,
  type ImageRecord,
  type WorkspaceRecord,
} from './idb'
import { renderSkillSystem } from './skills'
import { releaseObjectUrl } from './object-url'
import { useAiImageGenStore, type ApiConfig, type Job, type JobSlot } from './store'

const MAX_PARALLEL_JOBS = 2
const controllers = new Map<string, AbortController>()
const jobInputs = new Map<string, { references: string[] }>()

export type SubmitError = 'configRequired' | 'unsupportedProvider'

export function resolveImageConnection(
  config: ApiConfig = useAiImageGenStore.getState().genApi,
): AIConnection | null {
  const provider = config.provider === 'gemini' ? 'gemini' : 'openai'
  const model = config.model.trim() || DEFAULT_IMAGE_MODEL[provider]
  const connection = toAIConnection({
    provider,
    protocol: provider === 'openai' ? 'images-openai' : 'images-gemini',
    apiKey: config.apiKey,
    model,
    baseUrl: config.baseUrl,
  })
  return isModelConfigured(connection) ? connection : null
}

export function resolveVisionConnection(): AIConnection | null {
  const { visionApi } = useAiImageGenStore.getState()
  const preset = AI_PROVIDER_DEFINITIONS[visionApi.provider]
  const connection = toAIConnection({
    provider: visionApi.provider,
    protocol: preset.protocol,
    apiKey: visionApi.apiKey,
    model: visionApi.model,
    baseUrl: visionApi.baseUrl,
  })
  return isModelConfigured(connection) ? connection : null
}

const errorCode = (error: unknown): string =>
  error instanceof AIRequestError
    ? error.code
    : error instanceof Error && error.name === 'TimeoutError'
      ? 'timeout'
      : error instanceof Error && error.name === 'AbortError'
        ? 'aborted'
        : 'networkError'

async function evictIfNeeded() {
  const stats = await imageStats()
  const evict = selectEvictIds(stats, IMAGE_LIMIT.maxCount, IMAGE_LIMIT.maxBytes)
  for (const id of evict) {
    await deleteImage(id)
    releaseObjectUrl(id)
    useAiImageGenStore.getState().removeFromHistory(id)
  }
}

export async function refreshPrompts() {
  const entries = await listPrompts()
  useAiImageGenStore.getState().setPrompts(entries)
}

const HISTORY_PAGE = 60

const activeId = () => useAiImageGenStore.getState().activeWorkspaceId ?? LEGACY_WORKSPACE_ID

/** 工作区概念之前入库的记录没有 workspaceId，一律视为归属默认工作区 */
const ownedBy = (workspaceId: string | undefined) =>
  (workspaceId || LEGACY_WORKSPACE_ID) === activeId()

async function readAllImages(): Promise<ImageRecord[]> {
  const out: ImageRecord[] = []
  for (let offset = 0; ; offset += HISTORY_PAGE) {
    const batch = await listImages(offset, HISTORY_PAGE)
    out.push(...batch)
    if (batch.length < HISTORY_PAGE) {
      break
    }
  }
  return out
}

/** 循环读尽 IDB 再按活动工作区过滤：分页只是读取批次，画布需要一次看到本区全部存量 */
export async function loadHistory() {
  const all = await readAllImages()
  const store = useAiImageGenStore.getState()
  store.setImageOwners(
    all.map((record) => ({ workspaceId: record.meta.workspaceId, jobId: record.meta.jobId })),
  )
  store.setHistory(all.filter((record) => ownedBy(record.meta.workspaceId)))
}

export async function loadCanvas() {
  if (!isIdbAvailable()) {
    return
  }
  const records = await listCanvasNodes()
  useAiImageGenStore.getState().setOverlays(records.filter((record) => ownedBy(record.workspaceId)))
}

/**
 * 读工作区列表并与活动 id 对账，进工具与关掉工作区后都走它：
 * - 存量图片/overlay 里有没归属的，补一个默认工作区兜住，否则升级前生成的图会在列表里凭空消失；
 * - 一个工作区都没有（首次使用，或刚被全部关掉）就按自动命名补一个；
 * - 持久化的活动 id 可能指向已删除的工作区，回落到列表第一个。
 * @param defaultName 自动命名出来的默认工作区名
 */
export async function ensureActiveWorkspace(defaultName: string) {
  if (!isIdbAvailable()) {
    return
  }
  const store = useAiImageGenStore.getState()
  const [workspaces, images, overlays] = await Promise.all([
    listWorkspaces(),
    readAllImages(),
    listCanvasNodes(),
  ])
  const orphaned =
    images.some((record) => !record.meta.workspaceId) ||
    overlays.some((record) => !record.workspaceId)
  const now = Date.now()
  if (orphaned && !workspaces.some((record) => record.id === LEGACY_WORKSPACE_ID)) {
    const earliest = images.filter((record) => !record.meta.workspaceId).at(-1)?.meta.createdAt
    const legacy: WorkspaceRecord = {
      id: LEGACY_WORKSPACE_ID,
      name: defaultName,
      map: [],
      createdAt: earliest ?? now,
      updatedAt: earliest ?? now,
    }
    await putWorkspace(legacy)
    workspaces.unshift(legacy)
  }
  if (!workspaces.length) {
    // 沿用默认区 id：没有 workspaceId 的历史记录天然归它，删完再进来也不会串区
    const first: WorkspaceRecord = {
      id: LEGACY_WORKSPACE_ID,
      name: defaultName,
      map: [],
      createdAt: now,
      updatedAt: now,
    }
    await putWorkspace(first)
    workspaces.push(first)
  }
  store.setWorkspaces(workspaces)
  if (!workspaces.some((record) => record.id === store.activeWorkspaceId)) {
    store.setActiveWorkspace(workspaces[0].id)
  }
  await Promise.all([loadHistory(), loadCanvas()])
}

export async function createWorkspace(name: string) {
  const now = Date.now()
  const record: WorkspaceRecord = {
    id: ulid(),
    name: name.trim(),
    map: [],
    createdAt: now,
    updatedAt: now,
  }
  await putWorkspace(record)
  const store = useAiImageGenStore.getState()
  store.upsertWorkspace(record)
  store.setActiveWorkspace(record.id)
  await Promise.all([loadHistory(), loadCanvas()])
  return record
}

/**
 * 把某个画布的布局写进工作区记录的地图快照。工作区 id 由调用方给死：
 * 快照是防抖落盘的，切区之后再取当前 id 就会把上一区的布局写进新区的记录。
 * 没变就不碰 IDB，免得节点每动一下都写一次盘。
 */
export async function saveWorkspaceMap(workspaceId: string, rects: CanvasMapInput[]) {
  const current = useAiImageGenStore.getState().workspaces.find((item) => item.id === workspaceId)
  const map = buildCanvasMap(rects)
  if (!current || JSON.stringify(current.map) === JSON.stringify(map)) {
    return
  }
  await putWorkspace({ ...current, map })
  useAiImageGenStore.getState().patchWorkspaceMap(workspaceId, map)
}

/** 读图片固有尺寸；解不出来就留给画布按默认比例摆 */
async function readDimensions(blob: Blob): Promise<{ width: number; height: number } | undefined> {
  try {
    const bitmap = await createImageBitmap(blob)
    const size = { width: bitmap.width, height: bitmap.height }
    bitmap.close()
    return size
  } catch {
    return undefined
  }
}

export type ImportResult = { accepted: ImageRecord[]; rejected: number }

/**
 * 把外部图片导入当前工作区。校验沿用参考图口径（同一批 mime 与体积上限），
 * 这样任何落在画布上的图都具备被连进提示词当参考图的资格。
 */
export async function importImages(
  files: File[],
  position?: { x: number; y: number },
): Promise<ImportResult> {
  const store = useAiImageGenStore.getState()
  const workspaceId = activeId()
  const owners = [...store.imageOwners]
  const added: ImageRecord[] = []
  let rejected = 0

  for (const file of files) {
    if (!REFERENCE_MIMES.includes(file.type) || file.size > MAX_REFERENCE_BYTES) {
      rejected += 1
      continue
    }
    const blob = file.slice(0, file.size, file.type)
    const dimensions = await readDimensions(blob)
    const id = ulid()
    const record: ImageRecord = {
      id,
      blob,
      mimeType: file.type,
      width: dimensions?.width,
      height: dimensions?.height,
      meta: {
        jobId: id,
        workspaceId,
        imported: true,
        prompt: file.name,
        provider: 'local',
        model: 'import',
        params: defaultGenParams(),
        createdAt: Date.now(),
      },
    }
    await putImage(record)
    if (position) {
      // 多张横向错开一排，避免全叠在同一个坐标上
      await saveOverlay(
        overlayRecord(id, {
          x: Math.round(position.x + added.length * (CANVAS_IMAGE_WIDTH + CANVAS_GAP_X)),
          y: Math.round(position.y),
        }),
      )
    }
    added.push(record)
    owners.push({ workspaceId, jobId: id })
  }

  if (added.length) {
    store.setImageOwners(owners)
    store.appendHistory(added)
    await evictIfNeeded()
    void touchWorkspace(workspaceId)
  }
  return { accepted: added, rejected }
}

/** 删除工作区：图片、overlay、在跑任务与记录一起走，其他工作区不受影响 */
export async function removeWorkspace(id: string) {
  const store = useAiImageGenStore.getState()
  const removed = await deleteImagesOfWorkspace(id)
  await deleteCanvasNodesOfWorkspace(id)
  await deleteWorkspaceRecord(id)
  for (const imageId of removed) {
    releaseObjectUrl(imageId)
  }
  for (const job of store.jobs.filter((item) => item.workspaceId === id)) {
    cancelJob(job.id)
  }
  store.dropWorkspace(id)
  await Promise.all([loadHistory(), loadCanvas()])
}

/** 出图后把工作区顶到列表最前 */
export async function touchWorkspace(workspaceId: string) {
  const record = useAiImageGenStore.getState().workspaces.find((item) => item.id === workspaceId)
  if (!record) {
    return
  }
  const next = { ...record, updatedAt: Date.now() }
  await putWorkspace(next)
  useAiImageGenStore.getState().upsertWorkspace(next)
}

const overlayRecord = (
  nodeId: string,
  patch: Partial<CanvasNodeRecord> = {},
  createdAt = Date.now(),
): CanvasNodeRecord => {
  const merged: CanvasNodeRecord = {
    nodeId,
    workspaceId: activeId(),
    x: null,
    y: null,
    text: null,
    refs: [],
    chain: [],
    width: null,
    height: null,
    vision: false,
    mentions: [],
    createdAt,
    ...patch,
  }
  return { ...merged, refs: merged.refs ?? [], chain: merged.chain ?? [] }
}

async function saveOverlay(record: CanvasNodeRecord) {
  await putCanvasNode(record)
  useAiImageGenStore.getState().upsertOverlay(record)
  return record
}

/** 新建提示词节点：坐标来自画布投影，因此新节点落在用户眼前而不是自动布局区 */
export async function createPromptNode(text: string, position: { x: number; y: number }) {
  const nodeId = promptNodeIdOf(ulid())
  return saveOverlay(
    overlayRecord(nodeId, { text, x: Math.round(position.x), y: Math.round(position.y) }),
  )
}

/**
 * 复制一个提示词节点：文本、@ 绑定、参考图与上游链原样带走，落在正下方。
 * 编号不用重算——参考图顺序没变，所以 @图N 指的还是同一批图。
 * 原节点没钉位时副本也不钉，交给自动布局排，否则两个节点会叠在同一处。
 */
export async function duplicatePromptNode(nodeId: string) {
  const source = useAiImageGenStore.getState().overlays.find((item) => item.nodeId === nodeId)
  if (!source || source.text === null) {
    return null
  }
  const copyId = promptNodeIdOf(ulid())
  const pinned = source.x !== null && source.y !== null
  return saveOverlay(
    overlayRecord(
      copyId,
      {
        workspaceId: source.workspaceId,
        text: source.text,
        mentions: source.mentions,
        refs: source.refs,
        chain: source.chain,
        width: source.width,
        height: source.height,
        x: pinned ? source.x : null,
        y: pinned ? (source.y ?? 0) + (source.height ?? CANVAS_PROMPT_HEIGHT) + CANVAS_GAP_Y : null,
      },
      Date.now(),
    ),
  )
}

/** 界面语言决定 @图N 用哪套词；IDB 里两种写法都能解析回来 */
const canvasLang = () => (document.documentElement.lang.startsWith('zh') ? 'zh' : 'en')

/** 节点当前真正可用的参考图顺序，与出图请求共用同一套筛选 */
const usableRefs = (nodeId: string, refs: string[]): string[] =>
  usableReferenceIds(
    refs,
    (id) => useAiImageGenStore.getState().history.find((record) => record.id === id)?.meta,
    jobIdOfPromptNode(nodeId),
  )

const reconcileMentions = (nodeId: string, text: string, mentions: string[], refs: string[]) =>
  remapReferenceMentions({ text, mentions, refs: usableRefs(nodeId, refs), lang: canvasLang() })

export async function renamePromptNode(nodeId: string, text: string, mentions?: string[]) {
  const existing = useAiImageGenStore.getState().overlays.find((item) => item.nodeId === nodeId)
  const remapped = reconcileMentions(
    nodeId,
    text,
    mentions ?? existing?.mentions ?? [],
    existing?.refs ?? [],
  )
  return saveOverlay(
    overlayRecord(
      nodeId,
      { ...existing, text: remapped.text, mentions: remapped.mentions },
      existing?.createdAt ?? Date.now(),
    ),
  )
}

/** 连入/断开一张参考图：refs 顺序即参考图顺序，上限由 service 夹紧 */
export async function linkReference(nodeId: string, imageId: string, linked: boolean) {
  const existing = useAiImageGenStore.getState().overlays.find((item) => item.nodeId === nodeId)
  const refs = existing?.refs ?? []
  const next = linked ? [...refs, imageId] : refs.filter((ref) => ref !== imageId)
  // 顺序变了就重写编号；断开那张的标记一并摘掉，留着只会让模型指错图
  const remapped =
    existing?.text == null
      ? { text: existing?.text ?? null, mentions: existing?.mentions ?? [] }
      : reconcileMentions(nodeId, existing.text, existing.mentions ?? [], next)
  return saveOverlay(
    overlayRecord(
      nodeId,
      { ...existing, refs: next, text: remapped.text, mentions: remapped.mentions },
      existing?.createdAt ?? Date.now(),
    ),
  )
}

/** 接上/断开一条提示词链：上游的文本会按链路顺序拼进下游的最终提示词 */
export async function linkChain(nodeId: string, upstreamId: string, linked: boolean) {
  const existing = useAiImageGenStore.getState().overlays.find((item) => item.nodeId === nodeId)
  const chain = existing?.chain ?? []
  const next = linked ? [...chain, upstreamId] : chain.filter((link) => link !== upstreamId)
  return saveOverlay(
    overlayRecord(nodeId, { ...existing, chain: next }, existing?.createdAt ?? Date.now()),
  )
}

/** 用库存历史与 overlay 现算一张图：拼合最终提示词、展示链级数都走它 */
export function canvasGraphFromHistory(): CanvasGraph {
  const store = useAiImageGenStore.getState()
  const images: CanvasImageInput[] = store.history.map((record) => ({
    id: record.id,
    jobId: record.meta.jobId,
    prompt: record.meta.prompt,
    createdAt: record.meta.createdAt,
    ratio: aspectRatioOf(record.meta.params.aspect),
  }))
  return buildCanvasGraph(images, store.overlays)
}

export async function moveCanvasNode(nodeId: string, x: number, y: number) {
  const existing = useAiImageGenStore.getState().overlays.find((item) => item.nodeId === nodeId)
  return saveOverlay(
    overlayRecord(
      nodeId,
      { ...existing, x: Math.round(x), y: Math.round(y) },
      existing?.createdAt ?? Date.now(),
    ),
  )
}

/**
 * 批量落位：对齐一次挪多个节点，逐条写会触发同样次数的重渲染与图重建，
 * 所以 IDB 开一个事务、内存只 set 一次。
 */
export async function moveCanvasNodes(
  updates: { nodeId: string; x: number; y: number }[],
): Promise<void> {
  if (!updates.length) {
    return
  }
  const store = useAiImageGenStore.getState()
  const next = updates.map((update) => {
    const existing = store.overlays.find((item) => item.nodeId === update.nodeId)
    return overlayRecord(
      update.nodeId,
      {
        ...existing,
        x: Math.round(update.x),
        y: Math.round(update.y),
      },
      existing?.createdAt ?? Date.now(),
    )
  })
  await putCanvasNodes(next)
  store.setOverlays([
    ...store.overlays.filter((item) => !next.some((r) => r.nodeId === item.nodeId)),
    ...next,
  ])
}

/**
 * 缩放一个节点：尺寸与位置一起落库。
 * 未钉位的节点会被自动布局按尺寸重排，所以缩放的同时把当前位置钉住，否则松手就跳走。
 */
export async function resizeCanvasNode(
  nodeId: string,
  size: { width: number; height: number },
  position: { x: number; y: number },
) {
  const existing = useAiImageGenStore.getState().overlays.find((item) => item.nodeId === nodeId)
  const { width, height } = clampCanvasSize(nodeId, size.width, size.height)
  return saveOverlay(
    overlayRecord(
      nodeId,
      { ...existing, width, height, x: Math.round(position.x), y: Math.round(position.y) },
      existing?.createdAt ?? Date.now(),
    ),
  )
}

/**
 * 清掉手工坐标，让自动布局按血缘重新铺开。
 * 传 nodeIds 就只放开选中的那批，其余节点的手摆位置不动。
 */
export async function clearCanvasLayout(nodeIds?: string[]) {
  const store = useAiImageGenStore.getState()
  const targets = nodeIds
    ? store.overlays.filter((record) => nodeIds.includes(record.nodeId))
    : store.overlays
  const next = targets.map((record) => ({ ...record, x: null, y: null }))
  if (!next.length) {
    return
  }
  await putCanvasNodes(next)
  store.setOverlays([
    ...store.overlays.filter((record) => !next.some((item) => item.nodeId === record.nodeId)),
    ...next,
  ])
}

/**
 * 生图所需的参考图 data URL：提交时内存里有就用，
 * 刷新后内存 map 已空则回落到 overlay.refs 从 IDB 现取，重试不再静默丢参考图。
 */
async function resolveReferences(jobId: string): Promise<string[]> {
  const cached = jobInputs.get(jobId)?.references
  if (cached?.length) {
    return cached
  }
  const refs =
    useAiImageGenStore.getState().overlays.find((item) => item.nodeId === promptNodeIdOf(jobId))
      ?.refs ?? []
  const records = await Promise.all(refs.map((ref) => getImage(ref)))
  const byId = new Map<string, ImageRecord>()
  refs.forEach((ref, index) => {
    const record = records[index]
    if (record) {
      byId.set(ref, record)
    }
  })
  const out: string[] = []
  // 与画布同一套筛选：编号 @图N 是按这份顺序标出来的，少一张都会让提示词指错图
  for (const ref of usableReferenceIds(refs, (id) => byId.get(id)?.meta, jobId)) {
    const record = byId.get(ref)
    if (!record) {
      continue
    }
    const bytes = new Uint8Array(await record.blob.arrayBuffer())
    out.push(bytesToDataUrl(bytes, record.mimeType))
  }
  return out
}

function rememberPrompt(text: string, source: 'gen' | 'reverse', skillId?: string) {
  const entry = { id: ulid(), text, source, skillId, createdAt: Date.now() }
  void upsertPrompt(entry).then(() => {
    useAiImageGenStore.getState().upsertPrompt(entry)
  })
}

async function saveImage(job: Job, result: ImageGenerationResult, index: number) {
  const part = result.images[index]
  if (!part) {
    return undefined
  }
  const { bytes } = dataUrlToBytes(`data:${part.mimeType};base64,${part.base64}`)
  const record: ImageRecord = {
    id: ulid(),
    blob: new Blob([bytes], { type: part.mimeType }),
    mimeType: part.mimeType,
    meta: {
      jobId: job.id,
      workspaceId: job.workspaceId,
      prompt: job.prompt,
      revisedPrompt: result.revisedPrompt,
      provider: job.provider,
      model: job.model,
      params: job.params,
      usage: result.usage,
      createdAt: Date.now(),
    },
  }
  await putImage(record)
  await evictIfNeeded()
  const store = useAiImageGenStore.getState()
  if (ownedBy(record.meta.workspaceId)) {
    store.appendHistory([record])
  }
  store.setImageOwners([
    ...store.imageOwners,
    { workspaceId: record.meta.workspaceId, jobId: record.meta.jobId },
  ])
  void touchWorkspace(job.workspaceId)
  return record.id
}

function finishJob(jobId: string) {
  const store = useAiImageGenStore.getState()
  const job = store.jobs.find((item) => item.id === jobId)
  if (!job) {
    return
  }
  const statuses = job.slots.map((slot) => slot.status)
  const done = statuses.filter((status) => status === 'done').length
  const cancelled = statuses.filter((status) => status === 'cancelled').length
  const status =
    done === statuses.length
      ? 'done'
      : cancelled === statuses.length
        ? 'cancelled'
        : done > 0
          ? 'partial'
          : cancelled > 0
            ? 'cancelled'
            : 'failed'
  store.patchJob(jobId, { status, finishedAt: Date.now() })
  controllers.delete(jobId)
  pumpQueue()
}

async function runSlot(job: Job, slot: JobSlot, connection: AIConnection, references: string[]) {
  const store = useAiImageGenStore.getState()
  store.patchSlot(job.id, slot.id, { status: 'generating' })
  const controller = controllers.get(job.id)
  if (!controller) {
    return
  }
  try {
    const params = toImageRequestParams(
      connection.provider === 'openai' ? 'openai' : 'gemini',
      job.params,
    )
    const requestParams = connection.protocol === 'images-openai' ? params : { ...params, count: 1 }
    const result = await requestAIImages(
      connection,
      {
        prompt: job.prompt,
        images: references,
        params: requestParams,
      },
      controller.signal,
    )
    if (connection.protocol === 'images-openai') {
      for (let i = 0; i < job.slots.length; i++) {
        const target = job.slots[i]
        const imageId = await saveImage(job, result, i)
        useAiImageGenStore
          .getState()
          .patchSlot(
            job.id,
            target.id,
            imageId
              ? { status: 'done', imageId }
              : { status: 'failed', errorCode: 'noImageInResponse' },
          )
      }
      useAiImageGenStore.getState().patchJob(job.id, {
        usage: result.usage,
        revisedPrompt: result.revisedPrompt,
      })
    } else {
      const imageId = await saveImage(job, result, 0)
      store.patchSlot(
        job.id,
        slot.id,
        imageId
          ? { status: 'done', imageId }
          : { status: 'failed', errorCode: 'noImageInResponse' },
      )
      if (result.usage) {
        useAiImageGenStore.getState().patchJob(job.id, { usage: result.usage })
      }
    }
  } catch (error) {
    const code = errorCode(error)
    if (code === 'aborted') {
      store.patchSlot(job.id, slot.id, { status: 'cancelled' })
    } else if (connection.protocol === 'images-openai') {
      for (const target of useAiImageGenStore.getState().jobs.find((item) => item.id === job.id)
        ?.slots ?? []) {
        if (target.status === 'generating' || target.status === 'pending') {
          store.patchSlot(job.id, target.id, { status: 'failed', errorCode: code })
        }
      }
      store.patchJob(job.id, { errorCode: code })
    } else {
      store.patchSlot(job.id, slot.id, { status: 'failed', errorCode: code })
    }
  }
}

async function runJob(jobId: string) {
  const store = useAiImageGenStore.getState()
  const job = store.jobs.find((item) => item.id === jobId)
  if (!job) {
    return
  }
  const controller = new AbortController()
  controllers.set(jobId, controller)
  store.patchJob(jobId, { status: 'running', startedAt: Date.now() })
  // 识图只吃视觉凭证：放在生图连接检查之前，否则没配出图 key 时识图永远报 configRequired
  if (job.kind === 'reverse') {
    await runReverse(job, controller)
    finishJob(jobId)
    return
  }
  const connection = resolveImageConnection({
    ...useAiImageGenStore.getState().genApi,
    provider: job.provider === 'gemini' ? 'gemini' : 'openai',
  })
  if (!connection) {
    store.patchJob(jobId, { status: 'failed', errorCode: 'configRequired' })
    pumpQueue()
    return
  }
  rememberPrompt(job.prompt, 'gen')
  const references = await resolveReferences(job.id)
  if (connection.protocol === 'images-openai') {
    await runSlot(job, job.slots[0], connection, references)
  } else {
    await Promise.all(job.slots.map((slot) => runSlot(job, slot, connection, references)))
  }
  finishJob(jobId)
}

async function runReverse(job: Job, controller: AbortController) {
  const store = useAiImageGenStore.getState()
  const connection = resolveVisionConnection()
  const skill = store.skills.find((item) => item.id === job.skillId)
  store.patchSlot(job.id, job.slots[0].id, { status: 'generating' })
  if (!connection || !skill) {
    store.patchSlot(job.id, job.slots[0].id, {
      status: 'failed',
      errorCode: 'configRequired',
    })
    store.patchJob(job.id, { errorCode: 'configRequired' })
    return
  }
  try {
    const text = await requestAIText(
      connection,
      {
        system: renderSkillSystem(
          skill,
          document.documentElement.lang.startsWith('zh') ? 'zh' : 'en',
        ),
        text: 'Reverse-engineer this image now.',
        images: await resolveReferences(job.id),
      },
      controller.signal,
    )
    const candidates = parsePromptCandidates(text)
    if (!candidates.length) {
      store.patchSlot(job.id, job.slots[0].id, { status: 'failed', errorCode: 'emptyOutput' })
      store.patchJob(job.id, { errorCode: 'emptyOutput' })
      return
    }
    // 结果就地写回识图节点：候选之间空行分段，用户可在节点里删掉不要的那几条
    await renamePromptNode(promptNodeIdOf(job.id), candidates.join(CANVAS_PROMPT_JOINER))
    store.patchSlot(job.id, job.slots[0].id, { status: 'done' })
    for (const candidate of candidates) {
      rememberPrompt(candidate, 'reverse', skill.id)
    }
    void refreshPrompts()
  } catch (error) {
    const code = errorCode(error)
    store.patchSlot(job.id, job.slots[0].id, {
      status: code === 'aborted' ? 'cancelled' : 'failed',
      errorCode: code === 'aborted' ? undefined : code,
    })
    if (code !== 'aborted') {
      store.patchJob(job.id, { errorCode: code })
    }
  }
}

export function pumpQueue() {
  const store = useAiImageGenStore.getState()
  const running = store.jobs.filter((job) => job.status === 'running').length
  const queued = store.jobs
    .filter((job) => job.status === 'queued')
    .sort((a, b) => a.createdAt - b.createdAt)
  for (const job of queued.slice(0, MAX_PARALLEL_JOBS - running)) {
    void runJob(job.id)
  }
}

export type SubmitOptions = {
  /** 画布上预先铸造的 jobId，使提示词节点 id 在生成前后不变 */
  jobId?: string
  /** 参考图对应的库存图片 id，用于画布上画出 image → prompt 血缘边 */
  refImageIds?: string[]
  /** 节点自身文本：链式拼合后送出的 prompt 会更长，不能反过来覆盖掉原文 */
  nodeText?: string
}

export function submitGeneration(
  prompt: string,
  params: GenParams,
  references: string[],
  options: SubmitOptions = {},
): SubmitError | null {
  const store = useAiImageGenStore.getState()
  const connection = resolveImageConnection()
  if (!connection) {
    return 'configRequired'
  }
  const jobId = options.jobId ?? ulid()
  const nodeId = promptNodeIdOf(jobId)
  const existing = store.overlays.find((item) => item.nodeId === nodeId)
  const slots: JobSlot[] = Array.from({ length: params.count }, () => ({
    id: ulid(),
    status: 'pending',
  }))
  jobInputs.set(jobId, { references })
  void saveOverlay(
    overlayRecord(
      nodeId,
      {
        ...existing,
        text: options.nodeText ?? prompt,
        refs: options.refImageIds ?? existing?.refs ?? [],
      },
      existing?.createdAt ?? Date.now(),
    ),
  )
  store.addJob({
    id: jobId,
    kind: 'gen',
    workspaceId: activeId(),
    prompt,
    provider: connection.provider,
    model: connection.model,
    params,
    referenceCount: references.length,
    slots,
    status: 'queued',
    createdAt: Date.now(),
  })
  pumpQueue()
  return null
}

/** 画布上点提示词节点的「生图」：沿 chain 拼合出最终提示词，参考图来自已连入的图片节点 */
export async function submitCanvasGeneration(
  nodeId: string,
  params: GenParams,
): Promise<SubmitError | null> {
  const overlay = useAiImageGenStore.getState().overlays.find((item) => item.nodeId === nodeId)
  if (!overlay || overlay.text === null) {
    return 'configRequired'
  }
  const jobId = jobIdOfPromptNode(nodeId)
  const composed = composePromptText(canvasGraphFromHistory(), nodeId)
  const references = await resolveReferences(jobId)
  return submitGeneration(composed || overlay.text, params, references, {
    jobId,
    nodeText: overlay.text,
  })
}

export type ReverseInput = { dataUrl: string; name: string }

/**
 * 识图取词：每张图落成一对节点（左侧只读原图 + 右侧识图提示词），再各起一个 reverse 任务。
 * 成对坐标写进 overlay，因此自动布局不会把图和词拆散；参考图只用于识别，
 * 任务自己也不给出图入口，所以这些图片永远不会进下一次生图的参考。
 */
export async function submitReverse(
  images: ReverseInput[],
  skillId: string,
  position: { x: number; y: number },
): Promise<SubmitError | null> {
  const store = useAiImageGenStore.getState()
  const connection = resolveVisionConnection()
  if (!connection) {
    return 'configRequired'
  }
  const files = images.map((image) => {
    const { bytes, mimeType } = dataUrlToBytes(image.dataUrl)
    return new File([bytes], image.name, { type: mimeType })
  })
  const { accepted } = await importImages(files)
  let y = position.y
  for (const record of accepted) {
    const jobId = ulid()
    const ratio = record.width && record.height ? record.width / record.height : 1
    await moveCanvasNode(record.id, position.x, y)
    await saveOverlay(
      overlayRecord(promptNodeIdOf(jobId), {
        text: '',
        refs: [record.id],
        vision: true,
        x: Math.round(position.x + CANVAS_IMAGE_WIDTH + CANVAS_GAP_X),
        y: Math.round(y),
      }),
    )
    store.addJob({
      id: jobId,
      kind: 'reverse',
      workspaceId: activeId(),
      prompt: '',
      provider: connection.provider,
      model: connection.model,
      params: defaultGenParams(),
      referenceCount: 1,
      skillId,
      slots: [{ id: ulid(), status: 'pending' }],
      status: 'queued',
      createdAt: Date.now(),
    })
    y += imageHeightOf(ratio, CANVAS_IMAGE_WIDTH) + CANVAS_GAP_Y
  }
  pumpQueue()
  return null
}

export function cancelJob(jobId: string) {
  controllers.get(jobId)?.abort()
  const store = useAiImageGenStore.getState()
  const job = store.jobs.find((item) => item.id === jobId)
  if (!job) {
    return
  }
  for (const slot of job.slots) {
    if (slot.status !== 'done') {
      store.patchSlot(jobId, slot.id, { status: 'cancelled' })
    }
  }
  finishJob(jobId)
}

export function retryJob(jobId: string) {
  const store = useAiImageGenStore.getState()
  const job = store.jobs.find((item) => item.id === jobId)
  if (!job) {
    return
  }
  store.patchJob(jobId, {
    status: 'queued',
    errorCode: undefined,
    finishedAt: undefined,
    startedAt: undefined,
    createdAt: Date.now(),
  })
  for (const slot of job.slots) {
    if (slot.status !== 'done') {
      store.patchSlot(jobId, slot.id, { status: 'pending', errorCode: undefined })
    }
  }
  pumpQueue()
}

export async function deleteJobImages(jobId: string) {
  const store = useAiImageGenStore.getState()
  for (const record of store.history) {
    if (record.meta.jobId === jobId) {
      await deleteImage(record.id)
      await deleteCanvasNode(record.id)
      releaseObjectUrl(record.id)
      store.removeFromHistory(record.id)
      store.dropOverlay(record.id)
    }
  }
  const nodeId = promptNodeIdOf(jobId)
  await deleteCanvasNode(nodeId)
  store.dropOverlay(nodeId)
  store.removeJob(jobId)
}

/** 单张图删除：坐标 overlay 必须一起摘掉，否则重建时留下无人引用的孤儿记录 */
export async function removeCanvasImage(imageId: string) {
  const store = useAiImageGenStore.getState()
  await deleteImage(imageId)
  await deleteCanvasNode(imageId)
  releaseObjectUrl(imageId)
  store.removeFromHistory(imageId)
  store.dropOverlay(imageId)
}

/** 只清当前工作区：图片、归属本区的 overlay 与在跑的任务，其他工作区不受影响 */
export async function clearWorkspace() {
  const store = useAiImageGenStore.getState()
  for (const record of store.history) {
    await deleteImage(record.id)
    await deleteCanvasNode(record.id)
    releaseObjectUrl(record.id)
    store.removeFromHistory(record.id)
  }
  for (const overlay of (await listCanvasNodes()).filter((item) => ownedBy(item.workspaceId))) {
    await deleteCanvasNode(overlay.nodeId)
  }
  for (const job of store.jobs.filter((item) => ownedBy(item.workspaceId))) {
    store.removeJob(job.id)
  }
  await loadCanvas()
}
