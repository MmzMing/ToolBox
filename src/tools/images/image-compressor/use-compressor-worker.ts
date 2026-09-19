import { useEffect } from 'react'

import type { CompressOption } from './options'
import type { ImageInfo } from './engines/image-base'
import type { OutputMessageData } from './engines/handler'
import { uniqId, useCompressorStore, type ImageItem } from './store'

let workerCompress: Worker | null = null
let workerPreview: Worker | null = null

function onMessage(event: MessageEvent<OutputMessageData>) {
  useCompressorStore.getState().markMessage(event.data)
}

/** 挂载双 Worker：compress（并发队列）+ preview（单并发缩略图） */
export function useWorkerHandler() {
  useEffect(() => {
    workerCompress = new Worker(new URL('./engines/compress.worker.ts', import.meta.url), {
      type: 'module',
    })
    workerPreview = new Worker(new URL('./engines/preview.worker.ts', import.meta.url), {
      type: 'module',
    })
    workerCompress.addEventListener('message', onMessage)
    workerPreview.addEventListener('message', onMessage)

    return () => {
      workerCompress?.removeEventListener('message', onMessage)
      workerPreview?.removeEventListener('message', onMessage)
      workerCompress?.terminate()
      workerPreview?.terminate()
      workerCompress = null
      workerPreview = null
    }
  }, [])
}

function createMessageData(item: ImageItem, option: CompressOption) {
  return {
    /**
     * 不用展开运算符：postMessage 结构化克隆会把 Bitmap 等不可克隆字段带上导致报错
     * （参考 tools-pic transform.ts 的同名注释）
     */
    info: {
      key: item.key,
      name: item.name,
      blob: item.blob,
      width: item.width,
      height: item.height,
    } satisfies ImageInfo,
    option,
  }
}

/** 批量派发限速：一次性 postMessage 大量任务会阻塞主线程（参考 tools-pic） */
const dispatchQueue: Array<() => void> = []
let dispatchTimer: number | null = null

function flushDispatchQueue() {
  dispatchTimer = null
  for (let count = 0; count < 8 && dispatchQueue.length > 0; count++) {
    dispatchQueue.shift()!()
  }
  if (dispatchQueue.length > 0) {
    dispatchTimer = window.setTimeout(flushDispatchQueue, 0)
  }
}

function enqueueDispatch(task: () => void) {
  dispatchQueue.push(task)
  if (dispatchTimer === null) {
    dispatchTimer = window.setTimeout(flushDispatchQueue, 0)
  }
}

export function dispatchPreview(item: ImageItem) {
  const option = useCompressorStore.getState().option
  enqueueDispatch(() => workerPreview?.postMessage(createMessageData(item, option)))
}

export function dispatchCompress(item: ImageItem) {
  const option = useCompressorStore.getState().option
  enqueueDispatch(() => workerCompress?.postMessage(createMessageData(item, option)))
}

const ACCEPT_EXT = /\.(jpe?g|png|webp|gif|svg|avif|heic|heif)$/i
const MAX_BATCH_CHUNK = 40

export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || ACCEPT_EXT.test(file.name)
}

/** 添加文件：入 store → 派发预览 + 压缩（分批让出主线程） */
export async function addFilesAndDispatch(rawFiles: File[]) {
  const files = rawFiles.filter(isImageFile)
  if (files.length === 0) {
    return
  }

  const store = useCompressorStore.getState()
  const items: ImageItem[] = files.map((file) => ({
    key: uniqId(),
    name: file.name,
    blob: file,
    width: 0,
    height: 0,
    src: URL.createObjectURL(file),
    preview: undefined,
    compress: undefined,
    status: 'processing',
    processError: undefined,
    preservedOriginal: false,
  }))

  for (let offset = 0; offset < items.length; offset += MAX_BATCH_CHUNK) {
    const chunk = items.slice(offset, offset + MAX_BATCH_CHUNK)
    chunk.forEach((item) => store.addItem(item))
    chunk.forEach((item) => {
      dispatchPreview(item)
      dispatchCompress(item)
    })
    if (offset + MAX_BATCH_CHUNK < items.length) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
    }
  }
}

/** 单张重新压缩（沿用当前生效选项） */
export function reCompressOne(key: number) {
  const item = useCompressorStore.getState().list.get(key)
  if (!item) {
    return
  }
  useCompressorStore.getState().markPending(key)
  dispatchCompress(item)
}

/** 应用选项：归一化生效后全量重压 */
export function applyOptionAndRecompress(raw: CompressOption) {
  useCompressorStore.getState().applyOption(raw)
  for (const item of useCompressorStore.getState().list.values()) {
    dispatchCompress(item)
  }
}
