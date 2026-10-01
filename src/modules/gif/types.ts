/**
 * GIF 的 delay 字段只有 1/100 秒分辨率。内核内部一律使用 centisecond 整数，
 * 毫秒只在与 gifenc / modern-gif / UI 交互的边界处换算，避免 off-by-100 累积误差。
 */
export type RgbaImage = {
  width: number
  height: number
  /** 必须独占整个 ArrayBuffer（长度 = width * height * 4）；带偏移的视图会被编码器误读 */
  rgba: Uint8ClampedArray
}

export type GifDescriptor = {
  width: number
  height: number
  frameCount: number
  /** null 表示没有 NETSCAPE 循环扩展，即不循环 */
  loopCount: number | null
  /** 每帧延时（centisecond） */
  delaysCs: number[]
}

export type GifSize = { width: number; height: number }

/** 带延时的 RGBA 帧：跨线程与编码入参的统一形状 */
export type RgbaFrame = RgbaImage & { delayCs: number }

export function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value)
}

export function rgbaLength(width: number, height: number): number {
  return width * height * 4
}

/**
 * gifenc 的 quantize()/applyPalette() 用 `new Uint32Array(data.buffer)` 读像素，
 * 传带 byteOffset 的视图会连越界数据一起读进来，因此统一收口成独占缓冲区的副本。
 */
export function toOwnBuffer(rgba: Uint8ClampedArray): Uint8ClampedArray {
  const ownsBuffer = rgba.byteOffset === 0 && rgba.byteLength === rgba.buffer.byteLength
  return ownsBuffer ? rgba : new Uint8ClampedArray(rgba)
}
