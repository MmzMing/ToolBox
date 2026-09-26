import { PREVIEW_MAX_SIDE } from './image-stack.service'

export type ReadyAsset = {
  id: string
  name: string
  status: 'ready'
  width: number
  height: number
  /** 导出用原图位图 */
  full: ImageBitmap
  /** 预览用降采样位图，拖拽时不卡 */
  preview: ImageBitmap
  /** 素材条缩略图直接喂给 <img>，省一次 canvas 转 blob */
  thumbUrl: string
}

export type FailedAsset = {
  id: string
  name: string
  status: 'error'
  reason: 'decode' | 'empty'
}

export type AssetItem = ReadyAsset | FailedAsset

export function isReady(asset: AssetItem): asset is ReadyAsset {
  return asset.status === 'ready'
}

export function newAssetId(): string {
  return crypto.randomUUID()
}

/**
 * 解码成双级位图：原图留给导出，降采样图留给预览。
 * 失败不抛，返回 error 项由调用方展示，一张坏图不该阻塞整批。
 */
export async function decodeAsset(file: File, id: string): Promise<AssetItem> {
  const name = file.name || 'image'
  let full: ImageBitmap
  try {
    // from-image：手机照片普遍带 EXIF 旋转，不显式声明会拼出歪的成品
    full = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    return { id, name, status: 'error', reason: 'decode' }
  }

  if (full.width <= 0 || full.height <= 0) {
    full.close()
    return { id, name, status: 'error', reason: 'empty' }
  }

  const preview = await downscale(full, PREVIEW_MAX_SIDE)
  return {
    id,
    name,
    status: 'ready',
    width: full.width,
    height: full.height,
    full,
    preview,
    thumbUrl: URL.createObjectURL(file),
  }
}

/** 已经够小就原样返回，避免白拷一份内存 */
async function downscale(source: ImageBitmap, maxSide: number): Promise<ImageBitmap> {
  const scale = Math.min(1, maxSide / Math.max(source.width, source.height))
  if (scale >= 1) {
    return source
  }
  const width = Math.max(1, Math.round(source.width * scale))
  const height = Math.max(1, Math.round(source.height * scale))
  const canvas = new OffscreenCanvas(width, height)
  const context = canvas.getContext('2d')
  if (!context) {
    return source
  }
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(source, 0, 0, width, height)
  return createImageBitmap(canvas)
}

export function disposeAsset(asset: ReadyAsset): void {
  asset.full.close()
  // downscale 判定不需要缩放时 preview 与 full 是同一个对象
  if (asset.preview !== asset.full) {
    asset.preview.close()
  }
  URL.revokeObjectURL(asset.thumbUrl)
}
