import type { ImageUsage } from '@/modules/ai/transport'
import type { StorageStat } from '@/utils/lru'

import {
  LEGACY_WORKSPACE_ID,
  normalizeCanvasNode,
  type CanvasNodeRecord,
  type GenParams,
} from './ai-image-gen.service'

export type ImageMeta = {
  jobId: string
  /** 所属工作区；缺失视为历史遗留，归入默认工作区 */
  workspaceId?: string
  /** 本地拖入 / 上传的素材图，不是模型产出的 */
  imported?: boolean
  prompt: string
  revisedPrompt?: string
  provider: string
  model: string
  params: GenParams
  usage?: ImageUsage
  durationMs?: number
  createdAt: number
}

export type ImageRecord = {
  id: string
  blob: Blob
  mimeType: string
  width?: number
  height?: number
  meta: ImageMeta
}

export type WorkspaceRecord = {
  id: string
  name: string
  description: string
  createdAt: number
  updatedAt: number
}

export type PromptEntry = {
  id: string
  text: string
  source: 'reverse' | 'gen' | 'manual'
  skillId?: string
  createdAt: number
}

export const IMAGE_LIMIT = { maxCount: 300, maxBytes: 500 * 1024 * 1024 } as const
export const PROMPT_LIMIT = 200

const DB_NAME = 'toolbox-ai-image'
const DB_VERSION = 3

export const isIdbAvailable = () => typeof indexedDB !== 'undefined'

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains('images')) {
          const images = db.createObjectStore('images', { keyPath: 'id' })
          images.createIndex('createdAt', 'meta.createdAt')
        }
        if (!db.objectStoreNames.contains('prompts')) {
          const prompts = db.createObjectStore('prompts', { keyPath: 'id' })
          prompts.createIndex('text', 'text', { unique: true })
          prompts.createIndex('createdAt', 'createdAt')
        }
        if (!db.objectStoreNames.contains('canvasNodes')) {
          db.createObjectStore('canvasNodes', { keyPath: 'nodeId' })
        }
        if (!db.objectStoreNames.contains('workspaces')) {
          const workspaces = db.createObjectStore('workspaces', { keyPath: 'id' })
          workspaces.createIndex('updatedAt', 'updatedAt')
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error('idb open failed'))
    })
  }
  return dbPromise
}

function wrap<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('idb request failed'))
  })
}

async function store(
  name: 'images' | 'prompts' | 'canvasNodes' | 'workspaces',
  mode: IDBTransactionMode,
) {
  const db = await openDb()
  return db.transaction(name, mode).objectStore(name)
}

export async function putImage(record: ImageRecord): Promise<void> {
  await wrap((await store('images', 'readwrite')).put(record))
}

export async function getImage(id: string): Promise<ImageRecord | undefined> {
  return wrap((await store('images', 'readonly')).get(id))
}

export async function deleteImage(id: string): Promise<void> {
  await wrap((await store('images', 'readwrite')).delete(id))
}

/** 按 createdAt 倒序游标分页，offset 用 advance 跳过 */
export async function listImages(offset: number, limit: number): Promise<ImageRecord[]> {
  const objectStore = await store('images', 'readonly')
  let skip = offset
  return new Promise((resolve, reject) => {
    const out: ImageRecord[] = []
    const request = objectStore.index('createdAt').openCursor(null, 'prev')
    request.onerror = () => reject(request.error ?? new Error('idb cursor failed'))
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor || out.length >= limit) {
        resolve(out)
        return
      }
      if (skip > 0) {
        cursor.advance(skip)
        skip = 0
        return
      }
      out.push(cursor.value as ImageRecord)
      cursor.continue()
    }
  })
}

export async function imageStats(): Promise<StorageStat[]> {
  const objectStore = await store('images', 'readonly')
  return new Promise((resolve, reject) => {
    const out: StorageStat[] = []
    const request = objectStore.openCursor()
    request.onerror = () => reject(request.error ?? new Error('idb cursor failed'))
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) {
        resolve(out)
        return
      }
      const value = cursor.value as ImageRecord
      out.push({ id: value.id, createdAt: value.meta.createdAt, bytes: value.blob.size })
      cursor.continue()
    }
  })
}

export async function clearImages(): Promise<void> {
  await wrap((await store('images', 'readwrite')).clear())
}

/** 游标按工作区删除：不把 blob 读进内存，只回传被删的 id 供释放 object URL */
export async function deleteImagesOfWorkspace(workspaceId: string): Promise<string[]> {
  const objectStore = await store('images', 'readwrite')
  return new Promise((resolve, reject) => {
    const removed: string[] = []
    const request = objectStore.openCursor()
    request.onerror = () => reject(request.error ?? new Error('idb cursor failed'))
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) {
        resolve(removed)
        return
      }
      const value = cursor.value as ImageRecord
      if ((value.meta.workspaceId || LEGACY_WORKSPACE_ID) === workspaceId) {
        removed.push(value.id)
        cursor.delete()
      }
      cursor.continue()
    }
  })
}

export async function deleteCanvasNodesOfWorkspace(workspaceId: string): Promise<void> {
  const objectStore = await store('canvasNodes', 'readwrite')
  await new Promise<void>((resolve, reject) => {
    const request = objectStore.openCursor()
    request.onerror = () => reject(request.error ?? new Error('idb cursor failed'))
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) {
        resolve()
        return
      }
      const value = cursor.value as CanvasNodeRecord
      if ((value.workspaceId || LEGACY_WORKSPACE_ID) === workspaceId) {
        cursor.delete()
      }
      cursor.continue()
    }
  })
}

/** 画布 overlay：一条记录管住一个节点的位置，prompt 节点还管文本与入边 */
export async function putCanvasNode(record: CanvasNodeRecord): Promise<void> {
  await wrap((await store('canvasNodes', 'readwrite')).put(record))
}

/** 一次事务写多条：对齐这类批量落位用它，免得逐条开事务 */
export async function putCanvasNodes(records: CanvasNodeRecord[]): Promise<void> {
  const db = await openDb()
  const tx = db.transaction('canvasNodes', 'readwrite')
  records.forEach((record) => tx.objectStore('canvasNodes').put(record))
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('idb write failed'))
    tx.onabort = () => reject(tx.error ?? new Error('idb write aborted'))
  })
}

export async function deleteCanvasNode(nodeId: string): Promise<void> {
  await wrap((await store('canvasNodes', 'readwrite')).delete(nodeId))
}

/** 全量读：图片 300 张的硬顶决定了 overlay 规模，无需分页 */
export async function listCanvasNodes(): Promise<CanvasNodeRecord[]> {
  const rows = (await wrap((await store('canvasNodes', 'readonly')).getAll())) as unknown[]
  return rows
    .map((row) => normalizeCanvasNode(row))
    .filter((record): record is CanvasNodeRecord => record !== null)
}

export async function clearCanvasNodes(): Promise<void> {
  await wrap((await store('canvasNodes', 'readwrite')).clear())
}

export async function putWorkspace(record: WorkspaceRecord): Promise<void> {
  await wrap((await store('workspaces', 'readwrite')).put(record))
}

/** 按更新时间倒序：最近动过的工作区排在列表最前 */
export async function listWorkspaces(): Promise<WorkspaceRecord[]> {
  const objectStore = await store('workspaces', 'readonly')
  return new Promise((resolve, reject) => {
    const out: WorkspaceRecord[] = []
    const request = objectStore.index('updatedAt').openCursor(null, 'prev')
    request.onerror = () => reject(request.error ?? new Error('idb cursor failed'))
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) {
        resolve(out)
        return
      }
      out.push(cursor.value as WorkspaceRecord)
      cursor.continue()
    }
  })
}

export async function deleteWorkspace(id: string): Promise<void> {
  await wrap((await store('workspaces', 'readwrite')).delete(id))
}

/** text 唯一索引去重：同文重复入库只刷新时间戳并换来源 */
export async function upsertPrompt(entry: PromptEntry): Promise<void> {
  const objectStore = await store('prompts', 'readwrite')
  const existing = (await wrap(objectStore.index('text').get(entry.text))) as
    PromptEntry | undefined
  if (existing) {
    await wrap(objectStore.put({ ...existing, ...entry, id: existing.id }))
    return
  }
  await wrap(objectStore.put(entry))
  await trimPrompts()
}

export async function listPrompts(limit = PROMPT_LIMIT): Promise<PromptEntry[]> {
  const objectStore = await store('prompts', 'readonly')
  return new Promise((resolve, reject) => {
    const out: PromptEntry[] = []
    const request = objectStore.index('createdAt').openCursor(null, 'prev')
    request.onerror = () => reject(request.error ?? new Error('idb cursor failed'))
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor || out.length >= limit) {
        resolve(out)
        return
      }
      out.push(cursor.value as PromptEntry)
      cursor.continue()
    }
  })
}

export async function deletePrompt(id: string): Promise<void> {
  await wrap((await store('prompts', 'readwrite')).delete(id))
}

async function trimPrompts(): Promise<void> {
  const objectStore = await store('prompts', 'readwrite')
  const all = await wrap(objectStore.index('createdAt').getAllKeys())
  if (all.length <= PROMPT_LIMIT) {
    return
  }
  for (const key of all.slice(0, all.length - PROMPT_LIMIT)) {
    await wrap(objectStore.delete(key))
  }
}

export async function clearPrompts(): Promise<void> {
  await wrap((await store('prompts', 'readwrite')).clear())
}
