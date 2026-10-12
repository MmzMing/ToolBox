/**
 * 悬浮球的眼形：10 组笔画，本站自绘。
 *
 * 每只眼是一条**沿脊柱偏移出来的笔画**（两侧各一条 + 两端半圆帽），采样成 48 点的闭合多边形。
 * 脊柱本身就是表情：直的是竖杠，二次侧弓的是括号眼 ( )，中间折一下是 > < 或 ^ ^，
 * 整条转 90° 就是横着的 - -。
 *
 * 为什么要能转：竖条 ↔ 横条是这里最重要的一组过渡（睁眼 ↔ 闭眼、惊讶 ↔ 无语），
 * 而**插点插不出旋转**——竖条的第 i 点和横条的第 i 点差了 90°，平均出来只剩一坨。
 * 所以 morph 走的是**参数空间**：`lerpBar` 把两组参数插出来，再现场生成轮廓，
 * 胶囊于是真的转过去，全程保持饱满。`morphedEye` 是这个约定的唯一入口。
 *
 * 每组摊平成 192 个数：前 96 个左眼、后 96 个右眼，每两个一组 (x, y)。
 * 坐标活在 ORB_EYE_CENTER*2 见方的 viewBox 里，那个方框就是球体本身（内切），
 * 所以尺寸直接按球直径的百分比来读：1 单位 = 球直径的 1/240。
 *
 * 默认左右镜像对称（tilt / curve / chev 都是镜像的），想打破对称——单眼横躺、一大一小——
 * 用 `left` / `right` 给某一只眼打补丁。整组眼形的绝对位置会被 `orb-eyes.ts` 按双眼中点归心，
 * 脸落在球上的哪里由 FACE_ANCHOR 说了算，不在这里。
 */

/** 球心，也是眼睛坐标系的中心；viewBox 边长是它的两倍 */
export const ORB_EYE_CENTER = 120
/** 每只眼采样多少个点。两组眼形之间逐点插值，所以这个数对所有眼形一致 */
export const ORB_EYE_POINTS = 48
/** 双眼基准间距：每只眼的中心到脸中线的距离（球直径的 30%） */
const EYE_BASE_X = 36

/** 一只眼的全部参数。数值字段都可以被 `left` / `right` 覆盖 */
export type BarCore = {
  /** 沿脊柱方向的半长（h = w 就是正圆） */
  h: number
  /** 笔画半径（半宽）。太粗会把折角的凹口填平 */
  w: number
  /** 脊柱旋转角（度）。0 = 竖条，90 = 横条，中间值就是"正在转过去" */
  axis?: number
  /** 屏幕空间侧倾（度）。正 = 顶端向脸中线倒（皱眉），负 = 向外倒（八字、委屈） */
  tilt?: number
  /** 弓：脊柱二次侧移，读作括号眼 ( ) */
  curve?: number
  /** 折角：脊柱在中点折一下。竖条配正值得 > <；横条（axis 90）配正值才是朝上的 ^ ^ */
  chev?: number
  /** 上眼皮压下多少（0..1）。是"切平"而不是"缩小"——眼睛还是那么大 */
  lid?: number
  /** 下眼皮上抬多少（0..1） */
  under?: number
  /** 双眼间距在基准上的增减，正 = 更开 */
  spread?: number
  /** 左右眼高低差，正 = 右眼更低 */
  offset?: number
}

export type BarSpec = BarCore & {
  /** 只作用在左眼上的差异 */
  left?: Partial<BarCore>
  /** 只作用在右眼上的差异 */
  right?: Partial<BarCore>
}

/** 轮廓走一圈分四段：侧边 / 头帽 / 侧边 / 尾帽，各这么多点 */
const WALK = ORB_EYE_POINTS / 4

/** 插值时要逐字段走的键；没写的字段按 0 处理 */
const BAR_KEYS = [
  'h',
  'w',
  'axis',
  'tilt',
  'curve',
  'chev',
  'lid',
  'under',
  'spread',
  'offset',
] as const

const round1 = (v: number) => Number(v.toFixed(1))

const at = (bar: BarCore, key: (typeof BAR_KEYS)[number]): number => bar[key] ?? 0

/** 把某只眼的覆盖块合并进共享参数 */
function resolveBar(spec: BarSpec, side: 1 | -1): BarCore {
  return { ...spec, ...(side === 1 ? spec.right : spec.left) }
}

/** 两组参数之间插值。没写的字段当 0，所以插值结果总是全字段 */
export function lerpBar(a: BarCore, b: BarCore, t: number): BarCore {
  if (t <= 0) {
    return a
  }
  if (t >= 1) {
    return b
  }
  const out: Record<string, number> = {}
  for (const key of BAR_KEYS) {
    out[key] = at(a, key) + (at(b, key) - at(a, key)) * t
  }
  return out as BarCore
}

/**
 * 脊柱：s ∈ [-1,1] 沿长轴走，局部 +y 是脊柱方向、+x 是法向。
 * curve 让它二次侧弓，chev 让它在中间折成尖角。
 */
function spineAt(s: number, halfLen: number, curve: number, chev: number): [number, number] {
  return [curve * s * s + chev * Math.abs(s), halfLen * s]
}

/** 脊柱的单位切向与法向。chev 让 s=0 处导数不连续，那个折角就是它的全部意义 */
function spineFrame(s: number, halfLen: number, curve: number, chev: number) {
  const dx = 2 * curve * s + chev * Math.sign(s)
  const len = Math.hypot(dx, halfLen) || 1
  return { tx: dx / len, ty: halfLen / len, nx: -halfLen / len, ny: dx / len }
}

/**
 * 现场生成一只眼。side = 1 右眼、-1 左眼；坐标 +y 朝下（SVG）。
 *
 * 顺序固定：出笔画 → 转 axis → 侧倾 → 切眼皮 → 摆位。
 * 眼皮必须最后切（它是屏幕上的水平线，跟脊柱转没转无关），弯曲必须在旋转之前
 * （它属于脊柱本身）。
 */
function buildEye(bar: BarCore, side: 1 | -1): number[] {
  const halfLen = Math.max(0.5, bar.h - bar.w)
  const r = bar.w
  const curve = bar.curve ?? 0
  const chev = bar.chev ?? 0
  const rad = ((bar.axis ?? 0) * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const shear = Math.tan(((bar.tilt ?? 0) * Math.PI) / 180)
  const top = -bar.h * (1 - (bar.lid ?? 0))
  const bottom = bar.h * (1 - (bar.under ?? 0))
  const cx = ORB_EYE_CENTER + side * (EYE_BASE_X + (bar.spread ?? 0))
  const cy = ORB_EYE_CENTER + side * (bar.offset ?? 0)

  const walk: [number, number][] = []
  const sideAt = (s: number, sign: number) => {
    const [px, py] = spineAt(s, halfLen, curve, chev)
    const { nx, ny } = spineFrame(s, halfLen, curve, chev)
    walk.push([px + nx * r * sign, py + ny * r * sign])
  }
  const capAt = (end: number, k: number) => {
    const [px, py] = spineAt(end, halfLen, curve, chev)
    const { tx, ty, nx, ny } = spineFrame(end, halfLen, curve, chev)
    const phi = (Math.PI * k) / WALK
    const dir = end > 0 ? 1 : -1
    walk.push([
      px + r * (nx * Math.cos(phi) + tx * Math.sin(phi)) * dir,
      py + r * (ny * Math.cos(phi) + ty * Math.sin(phi)) * dir,
    ])
  }
  for (let k = 0; k < WALK; k += 1) sideAt(-1 + (2 * k) / WALK, 1)
  for (let k = 0; k < WALK; k += 1) capAt(1, k)
  for (let k = 0; k < WALK; k += 1) sideAt(1 - (2 * k) / WALK, -1)
  for (let k = 0; k < WALK; k += 1) capAt(-1, k)

  const out: number[] = []
  for (const [lx, ly] of walk) {
    // 转到屏幕方向，再侧倾、切眼皮，最后镜像摆到脸上
    let x = lx * cos - ly * sin
    let y = lx * sin + ly * cos
    x += shear * y
    y = Math.min(bottom, Math.max(top, y))
    out.push(round1(cx + side * x), round1(cy + y))
  }
  return out
}

/**
 * 10 组笔画，索引与 orb-eye-states.ts 的 EYE_PLAYLIST 对应。
 *
 * 一格往往被好几个情绪共用（每个状态是一段播放列表），所以下面标了引用它的状态。
 * 尺寸按"大眼睛"档：单眼半长 40 ≈ 球直径的 1/3。
 */
export const ORB_EYE_BARS: readonly BarSpec[] = [
  // 0  idle / listening / thinking / working / bored —— 日常那两条竖杠
  { h: 40, w: 15 },
  // 1  listening / curious / sad / scared —— 小圆眼，收拢注意力
  { h: 26, w: 26 },
  // 2  wide-eyed 全家 —— 最大的一档正圆，惊讶与害怕都靠它
  { h: 38, w: 34 },
  // 3  idle / happy / playful / celebrate —— 括号眼 ( )，柔和
  { h: 38, w: 13, curve: 9 },
  // 4  splay 八字 \ / —— 委屈、无奈、困。tilt 负 = 顶端向外倒
  { h: 36, w: 13, tilt: -16 },
  // 5  laughing / excited / suspicious —— 眯成 > <。笔画必须细，粗了凹口会被自己填平
  { h: 36, w: 10, chev: 22 },
  // 6  happy / celebrate / proud —— ^ ^ 笑脸：横躺的脊柱再折一下。
  //    旋转 90° 后屏幕 y 就等于局部的 chev 值，所以正值让两条臂落到下面、中间拱起 = ^；
  //    取负就成了 v v。这个符号反直觉，方向由 orb-eyes.test.ts 那条断言钉住。
  { h: 26, w: 10, axis: 90, chev: 14 },
  // 7  flat - - —— 双眼横条：关闭、无语、睡着
  { h: 30, w: 10, axis: 90 },
  // 8  wink | - —— 只让右眼躺下，读作眨眼与怀疑
  { h: 34, w: 13, right: { h: 26, w: 10, axis: 90 } },
  // 9  odd 一大一小 —— 左眼大圆、右眼小圆。差的是尺寸不是形状，读作歪头打量、犯嘀咕
  { h: 34, w: 34, right: { h: 20, w: 20 } },
]

/** 每格的右眼（覆盖块已合并），供 `morphedEye` 插值用 */
const RIGHT = ORB_EYE_BARS.map((spec) => resolveBar(spec, 1))
const LEFT = ORB_EYE_BARS.map((spec) => resolveBar(spec, -1))

/**
 * 某一格、某一只眼的最终参数。
 */
export function barAt(index: number, side: 1 | -1): BarCore {
  return side === 1 ? RIGHT[index] : LEFT[index]
}

/** 稳态轮廓缓存：不在 morph 中时不用每帧重算 48 个点 */
const BAKED = new Map<string, number[]>()

function baked(index: number, side: 1 | -1): number[] {
  const key = `${index}:${side}`
  let flat = BAKED.get(key)
  if (flat === undefined) {
    flat = buildEye(barAt(index, side), side)
    BAKED.set(key, flat)
  }
  return flat
}

/**
 * 播放列表从 `from` 荡到 `to`、进度 t 时，某只眼的轮廓点。
 *
 * 插的是参数不是点，所以 axis 0° → 90°（竖条转横条）会真的转过去。
 * t 打到两端时直接取缓存，稳态一帧只要一次查表。
 */
export function morphedEye(from: number, to: number, t: number, side: 1 | -1): number[] {
  if (t <= 0) {
    return baked(from, side)
  }
  if (t >= 1) {
    return baked(to, side)
  }
  return buildEye(lerpBar(barAt(from, side), barAt(to, side), t), side)
}

/** 10 组眼形的稳态数据，每组 192 个定点数（左眼 96 + 右眼 96）；归心与夹取都从它算 */
export const ORB_EYE_SHAPES: readonly (readonly number[])[] = ORB_EYE_BARS.map((_, index) => [
  ...baked(index, -1),
  ...baked(index, 1),
])
