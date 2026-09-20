import {
  FILE_HANDLE_DB,
  FILE_HANDLE_DB_VERSION,
  SYNC_DIRECTORY_HANDLE_KEY,
  SYNC_DIRECTORY_PATH_KEY,
} from './constants'
import { resumeFileName } from './resume.service'
import type { ResumeData } from './types'

/**
 * File System Access 本地文件夹同步。
 *
 * 目录句柄存 IndexedDB（localStorage 放不下），简历以 `<title>.json` 落盘。
 * 仅 Chromium 系支持，不支持时整条链路静默降级为只用 localStorage。
 */

type PermissionMode = 'read' | 'readwrite'

type MaybePermissionHandle = {
  queryPermission?: (options: { mode: PermissionMode }) => Promise<PermissionState>
  requestPermission?: (options: { mode: PermissionMode }) => Promise<PermissionState>
}

type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: (options?: {
    id?: string
    mode?: PermissionMode
  }) => Promise<FileSystemDirectoryHandle>
}

type DirectoryEntry = FileSystemFileHandle | FileSystemDirectoryHandle

type EnumerableDirectoryHandle = FileSystemDirectoryHandle & {
  values?: () => AsyncIterable<DirectoryEntry>
}

const HANDLE_STORE = 'handles'
const CONFIG_STORE = 'config'

let database: IDBDatabase | null = null

export function isFileSystemAccessSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof (window as DirectoryPickerWindow).showDirectoryPicker === 'function' &&
    typeof indexedDB !== 'undefined'
  )
}

function openDatabase(): Promise<IDBDatabase> {
  if (database) {
    return Promise.resolve(database)
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(FILE_HANDLE_DB, FILE_HANDLE_DB_VERSION)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      database = request.result
      resolve(database)
    }
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(HANDLE_STORE)) {
        db.createObjectStore(HANDLE_STORE)
      }
      if (!db.objectStoreNames.contains(CONFIG_STORE)) {
        db.createObjectStore(CONFIG_STORE)
      }
    }
  })
}

async function putValue(storeName: string, key: string, value: unknown): Promise<void> {
  const db = await openDatabase()
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite')
    const request = transaction.objectStore(storeName).put(value, key)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()
  })
}

async function readValue<T>(storeName: string, key: string): Promise<T | undefined> {
  const db = await openDatabase()
  return new Promise<T | undefined>((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly')
    const request = transaction.objectStore(storeName).get(key)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result as T | undefined)
  })
}

export function storeSyncDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  return putValue(HANDLE_STORE, SYNC_DIRECTORY_HANDLE_KEY, handle)
}

export function clearSyncDirectoryHandle(): Promise<void> {
  return putValue(HANDLE_STORE, SYNC_DIRECTORY_HANDLE_KEY, undefined)
}

export function storeSyncDirectoryPath(path: string): Promise<void> {
  return putValue(CONFIG_STORE, SYNC_DIRECTORY_PATH_KEY, path)
}

export function readSyncDirectoryPath(): Promise<string | undefined> {
  return readValue<string>(CONFIG_STORE, SYNC_DIRECTORY_PATH_KEY)
}

export async function getSyncDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  if (typeof indexedDB === 'undefined') {
    return null
  }

  try {
    const handle = await readValue<FileSystemDirectoryHandle>(
      HANDLE_STORE,
      SYNC_DIRECTORY_HANDLE_KEY,
    )
    return handle && handle.kind === 'directory' ? handle : null
  } catch {
    return null
  }
}

/** 句柄跨会话可复用，但浏览器仍可能要求再次授权；用户拒绝时返回 false 而非抛错 */
export async function verifyPermission(
  handle: FileSystemHandle | null,
  mode: PermissionMode = 'readwrite',
): Promise<boolean> {
  if (!handle) {
    return false
  }

  const permissionHandle = handle as FileSystemHandle & MaybePermissionHandle

  try {
    if ((await permissionHandle.queryPermission?.({ mode })) === 'granted') {
      return true
    }
    return (await permissionHandle.requestPermission?.({ mode })) === 'granted'
  } catch {
    return false
  }
}

/** 必须由用户手势触发：浏览器禁止非事件处理器内调用目录选择器 */
export async function pickSyncDirectory(): Promise<FileSystemDirectoryHandle | null> {
  const picker = (window as DirectoryPickerWindow).showDirectoryPicker
  if (!picker) {
    return null
  }

  const handle = await picker.call(window, { id: 'resume-sync', mode: 'readwrite' })
  await storeSyncDirectoryHandle(handle)
  await storeSyncDirectoryPath(handle.name)

  return handle
}

/**
 * 标题即文件名，因此改名要先删旧文件；删除失败只记日志，
 * 残留的旧文件在下次启动读取时按 updatedAt 覆盖，不影响正确性。
 */
export async function writeResumeToFile(
  resume: ResumeData,
  previous?: ResumeData,
): Promise<boolean> {
  const handle = await getSyncDirectoryHandle()
  if (!(await verifyPermission(handle))) {
    return false
  }

  try {
    const directory = handle as FileSystemDirectoryHandle

    if (previous && previous.id === resume.id && previous.title !== resume.title) {
      try {
        await directory.removeEntry(resumeFileName(previous.title))
      } catch (error) {
        console.warn('[resume-sync] stale file removal failed', error)
      }
    }

    const fileHandle = await directory.getFileHandle(resumeFileName(resume.title), {
      create: true,
    })
    const writable = await fileHandle.createWritable()
    await writable.write(JSON.stringify(resume, null, 2))
    await writable.close()

    return true
  } catch (error) {
    console.error('[resume-sync] write failed', error)
    return false
  }
}

export async function deleteResumeFile(resume: ResumeData): Promise<void> {
  const handle = await getSyncDirectoryHandle()
  if (!(await verifyPermission(handle))) {
    return
  }

  try {
    await (handle as FileSystemDirectoryHandle).removeEntry(resumeFileName(resume.title))
  } catch (error) {
    console.warn('[resume-sync] remove failed (file may not exist)', error)
  }
}

export type DirectoryResumeEntry = {
  resume: ResumeData
  sourceModifiedAt: number
  fileName: string
}

/** 原始解析结果在这里只做形状检查，收敛交给 normalizeResume */
export async function readResumesFromDirectory(): Promise<DirectoryResumeEntry[]> {
  const handle = await getSyncDirectoryHandle()
  if (!(await verifyPermission(handle, 'read'))) {
    return []
  }

  const directory = handle as FileSystemDirectoryHandle & EnumerableDirectoryHandle
  const entries = directory.values?.()
  if (!entries) {
    return []
  }

  const result: DirectoryResumeEntry[] = []

  for await (const entry of entries) {
    if (entry.kind !== 'file') {
      continue
    }
    if (!entry.name.toLowerCase().endsWith('.json')) {
      continue
    }

    try {
      const file = await entry.getFile()
      const parsed: unknown = JSON.parse(await file.text())

      if (!parsed || typeof parsed !== 'object' || typeof (parsed as ResumeData).id !== 'string') {
        continue
      }

      result.push({
        resume: parsed as ResumeData,
        sourceModifiedAt: file.lastModified,
        fileName: entry.name,
      })
    } catch (error) {
      console.error(`[resume-sync] read failed for "${entry.name}"`, error)
    }
  }

  return result
}
