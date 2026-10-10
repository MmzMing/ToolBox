import {
  clamp01,
  coverRect,
  easeOut,
  GUTTER_FROM,
  GUTTER_TO,
  measureTree,
  mix,
  MORPH,
  orderByDetail,
  PHOTO_FROM,
  SAMPLE,
  smoothstep,
  type Cell,
} from './grid'

/** 一块待绘制的矩形及其颜色 */
type Patch = {
  x: number
  y: number
  w: number
  h: number
  r: number
  g: number
  b: number
  tone: number
}

export type Scene = {
  ctx: CanvasRenderingContext2D
  root: Cell
  width: number
  height: number
  /** devicePixelRatio，缝宽与圆角按它换算 */
  scale: number
  dark: boolean
  /** 运行秒数，用来给灰块做呼吸 */
  clock: number
  /** 当前分裂进度 0-1 */
  split: number
  /** 图片落地的淡入量 0-1 */
  fade: number
  /** 取色是否成功；读不到像素时网格保持灰色 */
  hasColors: boolean
  image: HTMLImageElement | null
}

/**
 * 占位灰块：亮暗主题各一套底色，tone 决定明暗档，clock 让它缓慢起伏，
 * 所以等待时画面是活的，而不是死板的骨架屏。
 */
function greyOf(tone: number, dark: boolean, clock: number) {
  return (dark ? 30 : 228) + tone * 13 + Math.sin(clock * 1.5 + tone * 6.28) * 3
}

/**
 * 画一帧：从根格递归到叶子，分裂时刻已过的格子才继续下探，
 * 子格从父格矩形插值到自己的矩形——整棵树因此连续变形而非跳变。
 */
export function drawScene(s: Scene) {
  const { ctx, root, width, height, split } = s
  const tint = s.hasColors ? s.fade : 0
  const shade = (grey: number, target: number) => Math.round(mix(grey, target, tint))
  const base = greyOf(root.tone, s.dark, s.clock)

  // 缝是凹下去的，不是直接透出底下的背景
  ctx.fillStyle = `rgb(${Math.round(shade(base, root.r) * 0.92)},${Math.round(
    shade(base, root.g) * 0.92,
  )},${Math.round(shade(base, root.b) * 0.92)})`
  ctx.fillRect(0, 0, width, height)

  const soft = 1 - smoothstep(GUTTER_FROM, GUTTER_TO, split)
  const gutter = s.scale * soft
  const rounded = soft > 0.01 && typeof ctx.roundRect === 'function'

  const paint = (p: Patch) => {
    // 对齐到整像素，相邻格子才严丝合缝、不露出接缝
    const x = Math.round(p.x)
    const y = Math.round(p.y)
    const w = Math.round(p.x + p.w) - x
    const h = Math.round(p.y + p.h) - y

    const onLeft = x <= 0
    const onTop = y <= 0
    const onRight = x + w >= width
    const onBottom = y + h >= height

    // 只有内部边才留缝，外轮廓仍是完整的画面
    const left = onLeft ? 0 : gutter
    const top = onTop ? 0 : gutter
    const innerW = w - left - (onRight ? 0 : gutter)
    const innerH = h - top - (onBottom ? 0 : gutter)
    if (innerW <= 0 || innerH <= 0) {
      return
    }

    const grey = greyOf(p.tone, s.dark, s.clock)
    ctx.fillStyle = `rgb(${shade(grey, p.r)},${shade(grey, p.g)},${shade(grey, p.b)})`

    if (rounded) {
      const radius = Math.min(innerW, innerH) * 0.12 * soft
      ctx.beginPath()
      ctx.roundRect(x + left, y + top, innerW, innerH, [
        !onLeft && !onTop ? radius : 0,
        !onRight && !onTop ? radius : 0,
        !onRight && !onBottom ? radius : 0,
        !onLeft && !onBottom ? radius : 0,
      ])
      ctx.fill()
    } else {
      ctx.fillRect(x + left, y + top, innerW, innerH)
    }
  }

  const walk = (cell: Cell, p: Patch) => {
    if (!cell.kids || split < cell.splitAt) {
      paint(p)
      return
    }
    // 子格从父格的矩形出发，向自己的矩形插值
    const t = easeOut(clamp01((split - cell.splitAt) / MORPH))
    for (const kid of cell.kids) {
      walk(kid, {
        x: mix(p.x, kid.x * width, t),
        y: mix(p.y, kid.y * height, t),
        w: mix(p.w, kid.w * width, t),
        h: mix(p.h, kid.h * height, t),
        r: mix(p.r, kid.r, t),
        g: mix(p.g, kid.g, t),
        b: mix(p.b, kid.b, t),
        tone: mix(p.tone, kid.tone, t),
      })
    }
  }

  walk(root, {
    x: 0,
    y: 0,
    w: width,
    h: height,
    r: root.r,
    g: root.g,
    b: root.b,
    tone: root.tone,
  })

  if (!s.image) {
    return
  }
  const photo = s.hasColors ? smoothstep(PHOTO_FROM, 1, split) * s.fade : s.fade
  if (photo <= 0.002) {
    return
  }

  const fit = coverRect(s.image.naturalWidth, s.image.naturalHeight, width, height)
  ctx.globalAlpha = photo
  ctx.drawImage(s.image, fit.dx, fit.dy, fit.dw, fit.dh)
  ctx.globalAlpha = 1
}

/**
 * 把图片缩到 SAMPLE 见方后读像素，给格子树灌上真实平均色。
 * 跨域图片会污染 canvas，getImageData 抛错时返回 false，网格继续用灰色。
 * `at` 是读色当时的分裂进度：已经演过的时刻不参与重排。
 */
export function readAverages(
  el: HTMLImageElement,
  root: Cell,
  branches: Cell[],
  at: number,
): boolean {
  const buffer = document.createElement('canvas')
  buffer.width = SAMPLE
  buffer.height = SAMPLE
  const ctx = buffer.getContext('2d', { willReadFrequently: true })
  if (!ctx) {
    return false
  }

  const fit = coverRect(el.naturalWidth, el.naturalHeight, SAMPLE, SAMPLE)
  ctx.drawImage(el, fit.dx, fit.dy, fit.dw, fit.dh)

  try {
    measureTree(root, ctx.getImageData(0, 0, SAMPLE, SAMPLE).data, SAMPLE)
    orderByDetail(branches, at)
    return true
  } catch {
    return false
  }
}
