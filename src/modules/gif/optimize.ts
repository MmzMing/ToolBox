/**
 * Reference：
 * https://github.com/renzhezhilu/gifsicle-wasm-browser
 * https://www.lcdf.org/gifsicle/man.html
 */

import type { EncodeParams } from './targets'

export type GifsicleOptions = {
  /** -O1..3：帧间差分与调色板复用 */
  optimizeLevel?: 1 | 2 | 3
  /** gifsicle 的有损 LZW，0..200，越大越省但越容易出块 */
  lossy?: number
  maxColors?: number
  /** gifsicle 默认关闭：抖动会让文件变大、噪声可能跟着动画一起闪 */
  dither?: boolean
  resize?: { width: number; height: number }
  crop?: { x: number; y: number; width: number; height: number }
  /** 统一帧延时（centisecond，GIF 原生单位） */
  delayCs?: number
  /** null 表示显式去掉循环扩展 */
  loopCount?: number | null
}

type GifsicleFn = (input: {
  data: Array<{ file: ArrayBuffer; name: string }>
  command: string[]
}) => Promise<Array<{ file: BlobPart }>>

let loader: Promise<GifsicleFn> | null = null

function loadGifsicle(): Promise<GifsicleFn> {
  if (!loader) {
    // 路径必须先落进变量：字面量会被 vite:import-analysis 判定为「import public 下的 JS」而报错
    const path = '/codecs/gif/index.browser.js'
    loader = import(/* @vite-ignore */ path).then(
      (mod) => (mod as { gifsicle: GifsicleFn }).gifsicle,
    )
  }
  return loader
}

function int(name: string, value: number, min: number, max: number): string {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer in ${min}..${max}, got ${value}`)
  }
  return String(value)
}

/**
 * 纯函数：gifsicle 吃的是空格分隔的命令串，这里每个 token 只能由校验过的整数拼出，
 * 任何用户字符串都不允许直通命令（设计文档 §9 的安全面）。
 */
export function buildGifsicleArgs(options: GifsicleOptions): string[] {
  const args: string[] = []

  if (options.optimizeLevel !== undefined) {
    args.push(`--optimize=${int('optimizeLevel', options.optimizeLevel, 1, 3)}`)
  }
  if (options.lossy !== undefined) {
    args.push(`--lossy=${int('lossy', options.lossy, 0, 200)}`)
  }
  if (options.maxColors !== undefined) {
    args.push(`--colors=${int('maxColors', options.maxColors, 2, 256)}`)
  }
  if (options.dither) {
    args.push('--dither=floyd-steinberg')
  }
  if (options.resize) {
    const width = int('resize.width', options.resize.width, 1, 4096)
    const height = int('resize.height', options.resize.height, 1, 4096)
    args.push(`--resize=${width}x${height}`)
  }
  if (options.crop) {
    const x = int('crop.x', options.crop.x, 0, 65535)
    const y = int('crop.y', options.crop.y, 0, 65535)
    const width = int('crop.width', options.crop.width, 1, 65535)
    const height = int('crop.height', options.crop.height, 1, 65535)
    args.push(`--crop=${x},${y}+${width}x${height}`)
  }
  if (options.delayCs !== undefined) {
    args.push(`--delay=${int('delayCs', options.delayCs, 1, 65535)}`)
  }
  if (options.loopCount !== undefined) {
    args.push(
      options.loopCount === null
        ? '--no-loopcount'
        : `--loopcount=${int('loopCount', options.loopCount, 0, 65535)}`,
    )
  }

  return args
}

/**
 * gifsicle 不改帧率，所以这里的「尺寸」杠杆只作用于已编好的 GIF。
 * 尺寸与源一致时不下发 --resize，避免重采样把已有的帧差打散。
 */
export function scaledSize(
  source: { width: number; height: number },
  width: number,
): { width: number; height: number } {
  if (width >= source.width) {
    return { width: source.width, height: source.height }
  }
  return { width, height: Math.max(1, Math.round((source.height / source.width) * width)) }
}

export function optimizeOptionsFor(
  params: EncodeParams,
  source: { width: number; height: number },
  dither = false,
): { options: GifsicleOptions; size: { width: number; height: number } } {
  const size = scaledSize(source, params.width)
  const options: GifsicleOptions = {
    optimizeLevel: 3,
    maxColors: params.maxColors,
    lossy: params.lossy,
    dither,
  }
  if (size.width !== source.width || size.height !== source.height) {
    options.resize = size
  }
  return { options, size }
}

export async function optimizeGif(source: ArrayBuffer, options: GifsicleOptions): Promise<Blob> {
  const args = buildGifsicleArgs(options)
  const gifsicle = await loadGifsicle()
  const result = await gifsicle({
    data: [{ file: source, name: 'input.gif' }],
    command: [[...args, '--output=/out/output.gif', 'input.gif'].join(' ')],
  })
  if (!Array.isArray(result) || result.length !== 1) {
    throw new Error('gifsicle returned an unexpected result')
  }
  return new Blob([result[0].file], { type: 'image/gif' })
}
