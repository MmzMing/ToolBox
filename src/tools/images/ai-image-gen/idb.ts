import type { ImageUsage } from '@/modules/ai/transport'
import type { StorageStat } from '@/utils/lru'

import type { GenParams } from './ai-image-gen.service'

export type ImageMeta = {
  jobId: string
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
const DB_VERSION = 1

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

async function store(name: 'images' | 'prompts', mode: IDBTransactionMode) {
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
