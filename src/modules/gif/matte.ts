/**
 * 经典抠图引擎：作用在 RGBA 帧与 alpha 平面上的纯函数，零 DOM、零第三方依赖。
 *
 * 内核是 alpha 合成方程 `I = αF + (1−α)B`：每像素 4 个未知数、只有 3 个方程，
 * 必须补约束才解得开。循环 GIF 的背景通常是静止的，于是背景板 B 可以由时域中值
 * 估出来，α 变成「解」出来的而不是猜出来的——这也是本模块的 alpha 天然逐帧一致、
 * 不会像逐帧阈值那样闪烁的根本原因。
 */

import { rgbaLength, type RgbaFrame, type RgbaImage } from './types'

/** alpha 平面：255 = 保留（前景不透明），0 = 背景 */
export type Matte = { width: number; height: number; alpha: Uint8ClampedArray }

export type BackgroundModel = {
  width: number
  height: number
  /** 逐像素时域中值，即背景板 B */
  background: Uint8ClampedArray
  /** 逐像素离背景板最远的那个采样色，即前景色 F̂ 的近似 */
  foreground: Uint8ClampedArray
  /** 逐像素跨帧色差幅度（0..255）：低 = 这里从来没变过 = 静止背景 */
  motion: Uint8ClampedArray
}

/**
 * 取色种子。`color` 省略时从当前帧就地读色；跨帧复用同一个种子时必须显式带上取色那一帧的
 * 颜色，否则主体移动到种子位置后会把主体自己当成背景。
 */
export type ColorSeed = { x: number; y: number; color?: readonly [number, number, number] }

export type Stroke = {
  mode: 'keep' | 'erase'
  radius: number
  feather: number
  points: readonly { x: number; y: number }[]
}

export type MatteOutput =
  /** 原样写回软 alpha：给 PNG 序列用，PNG 有真 alpha，不需要退化 */
  | { mode: 'alpha' }
  | { mode: 'matte'; color: readonly [number, number, number] }
  | { mode: 'binary'; threshold: number }
  | { mode: 'dither'; method: DitherMethod }

export type DitherMethod = 'bayer8' | 'floyd-steinberg'

/** 时域中值要取样，全量排序对 300 帧 GIF 没有意义也没有必要 */
const SAMPLE_LIMIT = 15

/** 少于 3 帧取不出中值，也没有「跨帧不变」这个信号可用 */
export const MIN_TEMPORAL_FRAMES = 3

/** sRGB(0..255) → CIE Lab(D65)。容差必须在感知空间里量，否则深色区间的容差会远窄于浅色。 */
export function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  const toLinear = (c: number) => {
    const s = c / 255
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  const lr = toLinear(r)
  const lg = toLinear(g)
  const lb = toLinear(b)

  const x = (0.4124564 * lr + 0.3575761 * lg + 0.1804375 * lb) / 0.95047
  const y = 0.2126729 * lr + 0.7151522 * lg + 0.072175 * lb
  const z = (0.0193339 * lr + 0.119192 * lg + 0.9503041 * lb) / 1.08883

  const pivot = (t: number) => (t > 0.008856452 ? Math.cbrt(t) : 7.787037 * t + 16 / 116)
  const fx = pivot(x)
  const fy = pivot(y)
  const fz = pivot(z)

  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

/** CIE76 色差：够用且单调，够快得能在每个像素上跑 */
export function colorDistance(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): number {
  const [l1, a1, b1] = rgbToLab(a[0], a[1], a[2])
  const [l2, a2, b2] = rgbToLab(b[0], b[1], b[2])
  return Math.sqrt((l1 - l2) ** 2 + (a1 - a2) ** 2 + (b1 - b2) ** 2)
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}

function sqr(value: number): number {
  return value * value
}

/** 均匀取样索引：首帧与末帧都保留，中间的按等距四舍五入，去重后仍保持升序 */
export function sampleIndexes(total: number, limit = SAMPLE_LIMIT): number[] {
  if (!Number.isInteger(total) || total < 1) {
    throw new Error(`total must be a positive integer, got ${total}`)
  }
  const span = Math.min(total, Math.max(3, limit))
  if (span >= total) return Array.from({ length: total }, (_, index) => index)
  const indexes: number[] = []
  for (let i = 0; i < span; i++) {
    const next = Math.round((i * (total - 1)) / (span - 1))
    if (indexes[indexes.length - 1] !== next) indexes.push(next)
  }
  return indexes
}

/** 就地插入排序：长度 ≤ 15，比通用比较器快，排完还能直接给出 min/max 供 motion 用 */
function insertionSort(values: Int32Array, count: number): void {
  for (let i = 1; i < count; i++) {
    const current = values[i]
    let j = i - 1
    for (; j >= 0 && values[j] > current; j--) values[j + 1] = values[j]
    values[j + 1] = current
  }
}

export function estimateBackgroundModel(
  frames: readonly RgbaFrame[],
  sampleLimit = SAMPLE_LIMIT,
): BackgroundModel {
  if (frames.length < MIN_TEMPORAL_FRAMES) {
    throw new Error(`background model needs at least ${MIN_TEMPORAL_FRAMES} frames`)
  }
  const { width, height } = frames[0]
  for (const frame of frames) {
    if (frame.width !== width || frame.height !== height) {
      throw new Error('background model requires every frame to share one size')
    }
  }

  const indexes = sampleIndexes(frames.length, sampleLimit)
  const samples = indexes.length
  const pixels = width * height
  const background = new Uint8ClampedArray(pixels * 4)
  const foreground = new Uint8ClampedArray(pixels * 4)
  const motion = new Uint8ClampedArray(pixels)

  const rawR = new Int32Array(samples)
  const rawG = new Int32Array(samples)
  const rawB = new Int32Array(samples)
  const sortedR = new Int32Array(samples)
  const sortedG = new Int32Array(samples)
  const sortedB = new Int32Array(samples)

  for (let pixel = 0; pixel < pixels; pixel++) {
    const offset = pixel * 4
    for (let k = 0; k < samples; k++) {
      const rgba = frames[indexes[k]].rgba
      rawR[k] = rgba[offset]
      rawG[k] = rgba[offset + 1]
      rawB[k] = rgba[offset + 2]
    }
    sortedR.set(rawR)
    sortedG.set(rawG)
    sortedB.set(rawB)
    insertionSort(sortedR, samples)
    insertionSort(sortedG, samples)
    insertionSort(sortedB, samples)

    const mid = (samples - 1) >> 1
    const br = sortedR[mid]
    const bg = sortedG[mid]
    const bb = sortedB[mid]

    background[offset] = br
    background[offset + 1] = bg
    background[offset + 2] = bb
    background[offset + 3] = 255

    // 时域极差取三个通道里最宽的那个：只要任一通道变过，这里就不是静止背景
    motion[pixel] = clamp(
      Math.max(
        sortedR[samples - 1] - sortedR[0],
        sortedG[samples - 1] - sortedG[0],
        sortedB[samples - 1] - sortedB[0],
      ),
      0,
      255,
    )

    let bestDistance = -1
    let bestSample = 0
    for (let k = 0; k < samples; k++) {
      const distance = sqr(rawR[k] - br) + sqr(rawG[k] - bg) + sqr(rawB[k] - bb)
      if (distance > bestDistance) {
        bestDistance = distance
        bestSample = k
      }
    }
    foreground[offset] = rawR[bestSample]
    foreground[offset + 1] = rawG[bestSample]
    foreground[offset + 2] = rawB[bestSample]
    foreground[offset + 3] = 255
  }

  return { width, height, background, foreground, motion }
}

/**
 * 差值/color-line matting：把 |I−B| 投影到 |F̂−B| 这条颜色线上得到 α。
 * `threshold`/`softness` 都以 α 单位（0..255）表达，便于 UI 直接映射成滑块。
 */
export function differenceMatte(
  frame: RgbaImage,
  model: BackgroundModel,
  options: { threshold?: number; softness?: number; stillness?: number } = {},
): Matte {
  const { threshold = 24, softness = 96, stillness = 8 } = options
  if (frame.width !== model.width || frame.height !== model.height) {
    throw new Error('frame size does not match the background model')
  }
  if (frame.rgba.length !== rgbaLength(frame.width, frame.height)) {
    throw new Error(`rgba length does not match ${frame.width}x${frame.height}`)
  }
  if (!(softness > 0)) throw new Error(`softness must be positive, got ${softness}`)

  const pixels = frame.width * frame.height
  const alpha = new Uint8ClampedArray(pixels)

  for (let pixel = 0; pixel < pixels; pixel++) {
    const offset = pixel * 4
    const span = Math.sqrt(
      sqr(model.foreground[offset] - model.background[offset]) +
        sqr(model.foreground[offset + 1] - model.background[offset + 1]) +
        sqr(model.foreground[offset + 2] - model.background[offset + 2]),
    )
    // 该像素跨帧从没变过：它只能是背景，或者是一个被中值吃掉的静止主体（后者的兜底是取色器）
    if (span < 1 || model.motion[pixel] < stillness) {
      alpha[pixel] = 0
      continue
    }
    const distance = Math.sqrt(
      sqr(frame.rgba[offset] - model.background[offset]) +
        sqr(frame.rgba[offset + 1] - model.background[offset + 1]) +
        sqr(frame.rgba[offset + 2] - model.background[offset + 2]),
    )
    const projected = (distance / span) * 255
    alpha[pixel] = clamp(((projected - threshold) / softness) * 255, 0, 255)
  }

  return { width: frame.width, height: frame.height, alpha }
}

function seedColor(frame: RgbaImage, seed: ColorSeed): [number, number, number] {
  if (
    !Number.isInteger(seed.x) ||
    !Number.isInteger(seed.y) ||
    seed.x < 0 ||
    seed.y < 0 ||
    seed.x >= frame.width ||
    seed.y >= frame.height
  ) {
    throw new Error(`seed (${seed.x}, ${seed.y}) is outside ${frame.width}x${frame.height}`)
  }
  const offset = (seed.y * frame.width + seed.x) * 4
  if (seed.color) return [seed.color[0], seed.color[1], seed.color[2]]
  return [frame.rgba[offset], frame.rgba[offset + 1], frame.rgba[offset + 2]]
}

/**
 * 色键：按 Lab 色差给出「离种子色有多远」的斜坡。
 * `connected` 为真时只有与种子连成一片的区域算背景，避免把主体内部的同色块一起挖穿。
 */
export function colorKeyMatte(
  frame: RgbaImage,
  seeds: readonly ColorSeed[],
  options: { tolerance?: number; softness?: number; connected?: boolean } = {},
): Matte {
  if (seeds.length === 0) throw new Error('color key needs at least one seed')
  const { tolerance = 12, softness = 12, connected = true } = options
  if (!(softness > 0)) throw new Error(`softness must be positive, got ${softness}`)

  const reference = seeds.map((seed) => rgbToLab(...seedColor(frame, seed)))
  const { width, height } = frame
  const pixels = width * height
  const alpha = new Uint8ClampedArray(pixels)
  // 洪泛的通行判据必须和 alpha 来自同一张色差图，否则软边会被连通判定切成两截
  const passable = tolerance + softness
  const backgroundish = new Uint8Array(pixels)

  for (let pixel = 0; pixel < pixels; pixel++) {
    const offset = pixel * 4
    const [l, a, b] = rgbToLab(frame.rgba[offset], frame.rgba[offset + 1], frame.rgba[offset + 2])
    let closest = Infinity
    for (const [rl, ra, rb] of reference) {
      const distance = Math.sqrt(sqr(l - rl) + sqr(a - ra) + sqr(b - rb))
      if (distance < closest) closest = distance
    }
    alpha[pixel] = clamp(((closest - tolerance) / softness) * 255, 0, 255)
    backgroundish[pixel] = closest <= passable ? 1 : 0
  }

  if (connected) confineToSeeds(width, height, seeds, alpha, backgroundish)

  return { width, height, alpha }
}

/**
 * 从种子出发洪泛「像背景」的像素，到不了的地方一律判回前景。
 * 通行用 tolerance + softness 这一档，正好覆盖 alpha 的整个斜坡带。
 */
function confineToSeeds(
  width: number,
  height: number,
  seeds: readonly ColorSeed[],
  alpha: Uint8ClampedArray,
  backgroundish: Uint8Array,
): void {
  const pixels = width * height
  const visited = new Uint8Array(pixels)
  const stack = new Int32Array(pixels)
  let top = 0

  for (const seed of seeds) {
    const index = seed.y * width + seed.x
    if (!backgroundish[index] || visited[index]) continue
    visited[index] = 1
    stack[top++] = index
  }

  while (top > 0) {
    const index = stack[--top]
    const x = index % width
    const y = (index - x) / width
    for (const [dx, dy] of NEIGHBOURS) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
      const next = ny * width + nx
      if (visited[next] || !backgroundish[next]) continue
      visited[next] = 1
      stack[top++] = next
    }
  }

  for (let pixel = 0; pixel < pixels; pixel++) {
    if (!visited[pixel]) alpha[pixel] = 255
  }
}

const NEIGHBOURS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]

/** 盒式均值滤波，边界按实际窗宽归一，避免边缘发暗 */
function boxFilter(
  source: Float32Array,
  width: number,
  height: number,
  radius: number,
): Float32Array {
  const horizontal = new Float32Array(width * height)
  const vertical = new Float32Array(width * height)
  const prefix = new Float64Array(width + 1)

  for (let y = 0; y < height; y++) {
    const row = y * width
    prefix[0] = 0
    for (let x = 0; x < width; x++) prefix[x + 1] = prefix[x] + source[row + x]
    for (let x = 0; x < width; x++) {
      const left = Math.max(0, x - radius)
      const right = Math.min(width - 1, x + radius)
      horizontal[row + x] = (prefix[right + 1] - prefix[left]) / (right - left + 1)
    }
  }

  const column = new Float64Array(height + 1)
  for (let x = 0; x < width; x++) {
    column[0] = 0
    for (let y = 0; y < height; y++) column[y + 1] = column[y] + horizontal[y * width + x]
    for (let y = 0; y < height; y++) {
      const top = Math.max(0, y - radius)
      const bottom = Math.min(height - 1, y + radius)
      vertical[y * width + x] = (column[bottom + 1] - column[top]) / (bottom - top + 1)
    }
  }

  return vertical
}

/**
 * 引导滤波（He et al. 2010）：用原图的结构约束 alpha 的过渡，
 * 于是羽化沿真实边缘发生，而不是像高斯那样把边缘糊成一圈灰 halo。
 */
export function guidedFilter(
  matte: Matte,
  guide: RgbaImage,
  options: { radius?: number; epsilon?: number } = {},
): Matte {
  const { radius = 4, epsilon = 0.01 } = options
  if (matte.width !== guide.width || matte.height !== guide.height) {
    throw new Error('guide size does not match the matte')
  }
  if (!Number.isInteger(radius) || radius < 1) {
    throw new Error(`radius must be a positive integer, got ${radius}`)
  }

  const { width, height } = matte
  const pixels = width * height
  const current = new Float32Array(pixels)
  const gray = new Float32Array(pixels)

  for (let pixel = 0; pixel < pixels; pixel++) {
    const offset = pixel * 4
    gray[pixel] = (guide.rgba[offset] + guide.rgba[offset + 1] + guide.rgba[offset + 2]) / (3 * 255)
    current[pixel] = matte.alpha[pixel] / 255
  }

  const meanI = boxFilter(gray, width, height, radius)
  const meanP = boxFilter(current, width, height, radius)
  const product = new Float32Array(pixels)
  const square = new Float32Array(pixels)
  for (let pixel = 0; pixel < pixels; pixel++) {
    product[pixel] = gray[pixel] * current[pixel]
    square[pixel] = sqr(gray[pixel])
  }

  const correlation = boxFilter(product, width, height, radius)
  const energy = boxFilter(square, width, height, radius)
  const a = new Float32Array(pixels)
  const b = new Float32Array(pixels)
  for (let pixel = 0; pixel < pixels; pixel++) {
    const variance = energy[pixel] - sqr(meanI[pixel])
    const covariance = correlation[pixel] - meanI[pixel] * meanP[pixel]
    a[pixel] = covariance / (variance + epsilon)
    b[pixel] = meanP[pixel] - a[pixel] * meanI[pixel]
  }

  const smoothA = boxFilter(a, width, height, radius)
  const smoothB = boxFilter(b, width, height, radius)
  const alpha = new Uint8ClampedArray(pixels)
  for (let pixel = 0; pixel < pixels; pixel++) {
    alpha[pixel] = clamp((smoothA[pixel] * gray[pixel] + smoothB[pixel]) * 255, 0, 255)
  }

  return { width, height, alpha }
}

function rankFilter(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
  pick: 'min' | 'max',
): Uint8ClampedArray {
  const compare = pick === 'min' ? Math.min : Math.max
  const horizontal = new Uint8ClampedArray(source.length)
  const vertical = new Uint8ClampedArray(source.length)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let value = pick === 'min' ? 255 : 0
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = clamp(x + dx, 0, width - 1)
        value = compare(value, source[y * width + nx])
      }
      horizontal[y * width + x] = value
    }
  }
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      let value = pick === 'min' ? 255 : 0
      for (let dy = -radius; dy <= radius; dy++) {
        const ny = clamp(y + dy, 0, height - 1)
        value = compare(value, horizontal[ny * width + x])
      }
      vertical[y * width + x] = value
    }
  }
  return vertical
}

/** 腐蚀：alpha 向内收，用来吃掉贴边的噪点与半透明毛边 */
export function erode(matte: Matte, radius: number): Matte {
  return rankPass(matte, radius, 'min')
}

/** 膨胀：alpha 向外扩，与腐蚀配对组成开/闭运算 */
export function dilate(matte: Matte, radius: number): Matte {
  return rankPass(matte, radius, 'max')
}

function rankPass(matte: Matte, radius: number, pick: 'min' | 'max'): Matte {
  if (!Number.isInteger(radius) || radius < 0) {
    throw new Error(`radius must be a non-negative integer, got ${radius}`)
  }
  if (radius === 0) return { ...matte, alpha: new Uint8ClampedArray(matte.alpha) }
  const alpha = rankFilter(matte.alpha, matte.width, matte.height, radius, pick)
  return { width: matte.width, height: matte.height, alpha }
}

/**
 * 开运算去孤立噪点，闭运算补主体内的洞。两者都是「先扩再收」或「先收再扩」，
 * 顺序反了会把主体一起吃掉。
 */
export function morphology(matte: Matte, options: { open?: number; close?: number } = {}): Matte {
  const { open = 0, close = 0 } = options
  if (open < 0 || close < 0) throw new Error('morphology radii must not be negative')
  let result = matte
  if (open > 0) result = dilate(erode(result, open), open)
  if (close > 0) result = erode(dilate(result, close), close)
  if (result === matte) return rankPass(matte, 0, 'max')
  return result
}

/** 边缘整体收/放：正数收缩（去背景残留），负数扩张（找回被吃掉的主体边缘） */
export function shiftEdge(matte: Matte, pixels: number): Matte {
  if (!Number.isInteger(pixels)) throw new Error(`shiftEdge expects an integer, got ${pixels}`)
  return pixels >= 0 ? erode(matte, pixels) : dilate(matte, -pixels)
}

/** 各向同性羽化：两轮盒式≈三角核。真实边缘交给 guidedFilter 处理，这里只负责软。 */
export function feather(matte: Matte, radius: number): Matte {
  if (!Number.isInteger(radius) || radius < 0) {
    throw new Error(`feather radius must be a non-negative integer, got ${radius}`)
  }
  if (radius === 0) return rankPass(matte, 0, 'max')
  const { width, height } = matte
  const plane = new Float32Array(matte.alpha.length)
  for (let i = 0; i < plane.length; i++) plane[i] = matte.alpha[i]
  const blurred = boxFilter(boxFilter(plane, width, height, radius), width, height, radius)
  const alpha = new Uint8ClampedArray(blurred.length)
  for (let i = 0; i < blurred.length; i++) alpha[i] = clamp(blurred[i], 0, 255)
  return { width, height, alpha }
}

/**
 * 跨帧中值平滑：把逐帧独立算出的 alpha 再压一遍，抑制闪烁。
 * window 是单边半径（1 表示取前后各一帧，共 3 帧）。
 */
export function temporalSmoothMatte(mattes: readonly Matte[], window = 1): Matte[] {
  if (mattes.length === 0) throw new Error('temporal smoothing needs at least one matte')
  if (!Number.isInteger(window) || window < 1) {
    throw new Error(`window must be a positive integer, got ${window}`)
  }
  const { width, height } = mattes[0]
  const pixels = width * height
  for (const matte of mattes) {
    if (matte.width !== width || matte.height !== height) {
      throw new Error('temporal smoothing requires every matte to share one size')
    }
  }
  if (mattes.length < 3) return mattes.map((matte) => rankPass(matte, 0, 'max'))

  const span = window * 2 + 1
  const values = new Int32Array(span)
  return mattes.map((_, index) => {
    const alpha = new Uint8ClampedArray(pixels)
    for (let pixel = 0; pixel < pixels; pixel++) {
      let count = 0
      for (let offset = -window; offset <= window; offset++) {
        const neighbour = clamp(index + offset, 0, mattes.length - 1)
        values[count++] = mattes[neighbour].alpha[pixel]
      }
      insertionSort(values, count)
      alpha[pixel] = values[(count - 1) >> 1]
    }
    return { width, height, alpha }
  })
}

/**
 * 递归构造的 8×8 Bayer 矩阵：D_{2n} = [[4D, 4D+2], [4D+3, 4D+1]]，
 * 值域是 0..63 的一个排列（单测锁住这一点，因为它正是抖动密度守恒的前提）。
 * 手抄常量容易抄出重复值，这里宁可从定义生成。
 */
function buildBayer(size: number): Uint8Array {
  let matrix = new Uint8Array([0])
  let n = 1
  while (n < size) {
    const next = new Uint8Array(n * 2 * n * 2)
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const value = matrix[y * n + x] * 4
        next[y * n * 2 + x] = value
        next[y * n * 2 + n + x] = value + 2
        next[(y + n) * n * 2 + x] = value + 3
        next[(y + n) * n * 2 + n + x] = value + 1
      }
    }
    matrix = next
    n *= 2
  }
  return matrix
}

const BAYER8 = buildBayer(8)

/** 有序抖动需要 64 级阈值，映射到 0..255 时按 (v + 0.5) * 255/64 取格心 */
export function bayerLevel(x: number, y: number): number {
  return (BAYER8[(y % 8) * 8 + (x % 8)] + 0.5) * (255 / 64)
}

/**
 * 把软 alpha 落到 GIF 的 1-bit 透明上。误差只在 alpha 上传播，颜色通道不参与——
 * 混色会把抖动噪声画进图像里。
 *
 * 默认 bayer8：抖动图案固定在同一批像素位置上，逐帧不会漂移，动画里不会长虫子。
 * floyd-steinberg 的边缘更干净，但噪声图案逐帧变化，代价由用户自己承担。
 */
export function ditherAlpha(matte: Matte, options: { method?: DitherMethod } = {}): Matte {
  const { method = 'bayer8' } = options
  const { width, height } = matte
  const out = new Uint8ClampedArray(matte.alpha.length)

  if (method === 'bayer8') {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pixel = y * width + x
        out[pixel] = matte.alpha[pixel] > bayerLevel(x, y) ? 255 : 0
      }
    }
    return { width, height, alpha: out }
  }

  const buffer = new Float32Array(matte.alpha.length)
  for (let i = 0; i < buffer.length; i++) buffer[i] = matte.alpha[i]
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixel = y * width + x
      const value = buffer[pixel]
      const quantized = value > 127 ? 255 : 0
      out[pixel] = quantized
      const error = value - quantized
      if (x + 1 < width) buffer[pixel + 1] += (error * 7) / 16
      if (y + 1 < height) {
        const below = pixel + width
        if (x > 0) buffer[below - 1] += (error * 3) / 16
        buffer[below] += (error * 5) / 16
        if (x + 1 < width) buffer[below + 1] += error / 16
      }
    }
  }

  return { width, height, alpha: out }
}

/** 硬阈值：GIF 1-bit 透明的最省事实版，边缘会有锯齿 */
export function binarizeAlpha(matte: Matte, threshold = 127): Matte {
  if (!Number.isInteger(threshold) || threshold < 0 || threshold > 255) {
    throw new Error(`threshold must be an integer in 0..255, got ${threshold}`)
  }
  const alpha = new Uint8ClampedArray(matte.alpha.length)
  for (let i = 0; i < alpha.length; i++) alpha[i] = matte.alpha[i] > threshold ? 255 : 0
  return { width: matte.width, height: matte.height, alpha }
}

/** 前景取两者中更保守的一侧：min = 任一方法判为背景就删，max = 两法都判前景才留 */
export function combineMatte(first: Matte, second: Matte, mode: 'min' | 'max' = 'min'): Matte {
  if (first.width !== second.width || first.height !== second.height) {
    throw new Error('cannot combine mattes of different sizes')
  }
  const alpha = new Uint8ClampedArray(first.alpha.length)
  const pick = mode === 'min' ? Math.min : Math.max
  for (let i = 0; i < alpha.length; i++) alpha[i] = pick(first.alpha[i], second.alpha[i])
  return { width: first.width, height: first.height, alpha }
}

/**
 * 手绘画笔。笔画不落到位图上，而是每次从头重放：
 * 参数一改就能重算，撤销/重做只是笔画列表的增删，也让单测能断言幂等。
 */
export function applyStroke(matte: Matte, stroke: Stroke): Matte {
  const { mode, radius, feather: softness, points } = stroke
  if (!Number.isInteger(radius) || radius < 1) {
    throw new Error(`stroke radius must be a positive integer, got ${radius}`)
  }
  if (softness < 0) throw new Error('stroke feather must not be negative')

  const { width, height } = matte
  const alpha = new Uint8ClampedArray(matte.alpha)
  const reach = radius + softness

  for (const point of points) {
    const left = Math.max(0, Math.floor(point.x - reach))
    const right = Math.min(width - 1, Math.ceil(point.x + reach))
    const top = Math.max(0, Math.floor(point.y - reach))
    const bottom = Math.min(height - 1, Math.ceil(point.y + reach))

    for (let y = top; y <= bottom; y++) {
      for (let x = left; x <= right; x++) {
        const distance = Math.sqrt(sqr(x - point.x) + sqr(y - point.y))
        if (distance > reach) continue
        // 半径内实心，半径外按 feather 线性衰减到 0
        const falloff =
          distance <= radius
            ? 1
            : softness > 0
              ? clamp(1 - (distance - radius) / softness, 0, 1)
              : 0
        const pixel = y * width + x
        if (mode === 'keep') alpha[pixel] = Math.max(alpha[pixel], Math.round(255 * falloff))
        else alpha[pixel] = Math.min(alpha[pixel], Math.round(255 * (1 - falloff)))
      }
    }
  }

  return { width, height, alpha }
}

/** 绿幕溢色：把超出 max(r,b) 的那部分绿压回去，边缘就不会带一圈绿边 */
export function despill(frame: RgbaImage, options: { strength?: number } = {}): RgbaImage {
  const strength = clamp(options.strength ?? 1, 0, 1)
  const rgba = new Uint8ClampedArray(frame.rgba)
  for (let i = 0; i < rgba.length; i += 4) {
    const limit = Math.max(rgba[i], rgba[i + 2])
    const excess = rgba[i + 1] - limit
    if (excess > 0) rgba[i + 1] = clamp(rgba[i + 1] - excess * strength, 0, 255)
  }
  return { width: frame.width, height: frame.height, rgba }
}

/**
 * 前景去污染：已知 B 的时候可以直接解合成方程的反式 F = (I − (1−α)B)/α，
 * 把混进半透明边缘的背景色算掉，而不是靠模糊把它藏起来。
 */
export function decontaminate(
  frame: RgbaImage,
  matte: Matte,
  background: Uint8ClampedArray,
): RgbaImage {
  if (frame.width !== matte.width || frame.height !== matte.height) {
    throw new Error('matte size does not match the frame')
  }
  const rgba = new Uint8ClampedArray(frame.rgba)
  for (let pixel = 0; pixel < matte.alpha.length; pixel++) {
    const opacity = matte.alpha[pixel] / 255
    // 全透明处 F 无定义，全不透明处 I 就是 F：只有中间带需要反解
    if (opacity <= 0 || opacity >= 1) continue
    const offset = pixel * 4
    for (let channel = 0; channel < 3; channel++) {
      const value =
        (rgba[offset + channel] - (1 - opacity) * background[offset + channel]) / opacity
      rgba[offset + channel] = clamp(Math.round(value), 0, 255)
    }
  }
  return { width: frame.width, height: frame.height, rgba }
}

/** 合成到纯色底：放弃透明换取最稳的显示效果，是默认输出档 */
export function compositeOver(
  frame: RgbaImage,
  matte: Matte,
  color: readonly [number, number, number],
): RgbaImage {
  if (frame.width !== matte.width || frame.height !== matte.height) {
    throw new Error('matte size does not match the frame')
  }
  const rgba = new Uint8ClampedArray(frame.rgba)
  for (let pixel = 0; pixel < matte.alpha.length; pixel++) {
    const opacity = matte.alpha[pixel] / 255
    const offset = pixel * 4
    for (let channel = 0; channel < 3; channel++) {
      rgba[offset + channel] = Math.round(
        frame.rgba[offset + channel] * opacity + color[channel] * (1 - opacity),
      )
    }
    rgba[offset + 3] = 255
  }
  return { width: frame.width, height: frame.height, rgba }
}

/**
 * 把 alpha 遮罩落到帧上，产出可直接交给 createGifWriter 的序列。
 * 透明像素的 RGB 留给编码器洗（它才知道透明槽用的是哪个清理色）。
 */
export function applyMatte(
  frames: readonly RgbaFrame[],
  mattes: readonly Matte[],
  output: MatteOutput,
): RgbaFrame[] {
  if (frames.length !== mattes.length) {
    throw new Error(`got ${mattes.length} mattes for ${frames.length} frames`)
  }

  return frames.map((frame, index) => {
    const matte = mattes[index]
    if (frame.width !== matte.width || frame.height !== matte.height) {
      throw new Error(`matte ${index} does not match the frame size`)
    }
    if (output.mode === 'matte') {
      return { ...compositeOver(frame, matte, output.color), delayCs: frame.delayCs }
    }
    const plane =
      output.mode === 'alpha'
        ? matte
        : output.mode === 'binary'
          ? binarizeAlpha(matte, output.threshold)
          : ditherAlpha(matte, output)
    const rgba = new Uint8ClampedArray(frame.rgba)
    for (let pixel = 0; pixel < plane.alpha.length; pixel++) {
      rgba[pixel * 4 + 3] = plane.alpha[pixel]
    }
    return { width: frame.width, height: frame.height, delayCs: frame.delayCs, rgba }
  })
}
