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
import { dataUrlToBytes } from '@/utils/base64'
import { selectEvictIds } from '@/utils/lru'

import {
  defaultGenParams,
  parsePromptCandidates,
  toImageRequestParams,
  type GenParams,
} from './ai-image-gen.service'
import {
  deleteImage,
  IMAGE_LIMIT,
  imageStats,
  listImages,
  listPrompts,
  putImage,
  upsertPrompt,
  type ImageRecord,
} from './idb'
import { renderSkillSystem } from './skills'
import { useAiImageGenStore, type ApiConfig, type Job, type JobSlot } from './store'

const MAX_PARALLEL_JOBS = 2
const controllers = new Map<string, AbortController>()
const jobInputs = new Map<string, { references: string[]; skillId?: string }>()

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
    useAiImageGenStore.getState().removeFromHistory(id)
  }
}

export async function refreshPrompts() {
  const entries = await listPrompts()
  useAiImageGenStore.getState().setPrompts(entries)
}

export async function loadHistory(reset = false) {
  const store = useAiImageGenStore.getState()
  const offset = reset ? 0 : store.history.length
  const records = await listImages(offset, 60)
  if (reset) {
    store.setHistory(records, records.length === 60)
  } else {
    useAiImageGenStore.setState((state) => ({
      history: [...state.history, ...records],
      hasMoreHistory: records.length === 60,
      historyLoaded: true,
    }))
  }
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
  useAiImageGenStore.getState().appendHistory([record])
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

async function runSlot(job: Job, slot: JobSlot, connection: AIConnection) {
  const store = useAiImageGenStore.getState()
  const references = jobInputs.get(job.id)?.references ?? []
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
  const connection = resolveImageConnection({
    ...useAiImageGenStore.getState().genApi,
    provider: job.provider === 'gemini' ? 'gemini' : 'openai',
  })
  if (!connection) {
    store.patchJob(jobId, { status: 'failed', errorCode: 'configRequired' })
    pumpQueue()
    return
  }
  const controller = new AbortController()
  controllers.set(jobId, controller)
  store.patchJob(jobId, { status: 'running', startedAt: Date.now() })
  if (job.kind === 'gen') {
    rememberPrompt(job.prompt, 'gen')
  }

  if (job.kind === 'reverse') {
    await runReverse(job, controller)
    finishJob(jobId)
    return
  }

  if (connection.protocol === 'images-openai') {
    await runSlot(job, job.slots[0], connection)
  } else {
    await Promise.all(job.slots.map((slot) => runSlot(job, slot, connection)))
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
        images: jobInputs.get(job.id)?.references ?? [],
      },
      controller.signal,
    )
    const candidates = parsePromptCandidates(text)
    if (!candidates.length) {
      store.patchSlot(job.id, job.slots[0].id, { status: 'failed', errorCode: 'emptyOutput' })
      store.patchJob(job.id, { errorCode: 'emptyOutput' })
      return
    }
    store.patchSlot(job.id, job.slots[0].id, { status: 'done' })
    store.patchJob(job.id, { candidates })
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

export function submitGeneration(
  prompt: string,
  params: GenParams,
  references: string[],
): SubmitError | null {
  const store = useAiImageGenStore.getState()
  const connection = resolveImageConnection()
  if (!connection) {
    return 'configRequired'
  }
  const jobId = ulid()
  const slots: JobSlot[] = Array.from({ length: params.count }, () => ({
    id: ulid(),
    status: 'pending',
  }))
  jobInputs.set(jobId, { references })
  store.addJob({
    id: jobId,
    kind: 'gen',
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

export function submitReverse(imageDataUrl: string, skillId: string): SubmitError | null {
  const store = useAiImageGenStore.getState()
  const connection = resolveVisionConnection()
  if (!connection) {
    return 'configRequired'
  }
  const jobId = ulid()
  jobInputs.set(jobId, { references: [imageDataUrl], skillId })
  store.addJob({
    id: jobId,
    kind: 'reverse',
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
      store.removeFromHistory(record.id)
    }
  }
  store.removeJob(jobId)
}
