export type CompressedImage = string

/** base64 data URL 的近似字节数：去掉 `data:...;base64,` 头后按 4/3 换算 */
export function estimateBase64Size(base64String: string): number {
  const base64 = base64String.split(',')[1] ?? base64String
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding)
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('image decode failed'))
    image.src = src
  })
}

/**
 * 等比缩放到 maxWidth × maxHeight 盒内并按 quality 编码。
 *
 * 头像与证书图以 base64 存在同一份 localStorage 里，不压就直接撞配额。
 */
export async function compressImage(
  file: File,
  maxWidth = 1200,
  maxHeight = 1200,
  quality = 0.8,
): Promise<CompressedImage> {
  const image = await loadImage(await readAsDataURL(file))

  const ratio = Math.min(1, maxWidth / image.width, maxHeight / image.height)
  const width = Math.max(1, Math.round(image.width * ratio))
  const height = Math.max(1, Math.round(image.height * ratio))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('canvas unavailable')
  }

  // JPEG 没有透明通道，先把底填白，否则 PNG 的透明区会变黑
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)
  context.drawImage(image, 0, 0, width, height)

  return canvas.toDataURL('image/jpeg', quality)
}

/**
 * 逐级降质直到 base64 体积达标。
 *
 * 阶梯全走完仍超标时返回最后一档：宁可图差点，也不要静默丢掉用户的内容。
 */
export async function compressToLimit(
  file: File,
  ladder: readonly { maxWidth: number; quality: number }[],
  limitBytes: number,
): Promise<CompressedImage> {
  let result = await compressImage(file, ladder[0].maxWidth, ladder[0].maxWidth, ladder[0].quality)

  for (const step of ladder.slice(1)) {
    if (estimateBase64Size(result) <= limitBytes) {
      return result
    }
    result = await compressImage(file, step.maxWidth, step.maxWidth, step.quality)
  }

  return result
}
