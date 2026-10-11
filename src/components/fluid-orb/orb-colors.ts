/**
 * rim 流光的颜色准备：把用户给的 hex 解析成线性空间的 rgb，交给着色器做沿周长的循环插值。
 *
 * 必须转 linear：着色器里的加法/插值都发生在线性空间，直接把 sRGB 分量当亮度用，
 * #ff006e 这类高饱和色会在混色处明显偏亮偏灰，参考图里那种干净的品红就没了。
 */

export type LinearRGB = readonly [number, number, number]

/** 解析失败时的兜底色轮，与参数表给的默认值一致 */
export const FALLBACK_COLORS = ['#ff006e', '#8338ec', '#3a86ff', '#06ffa5'] as const

/** 着色器里的色轮数组按 4 个槽位固定分配，少于 2 个无法成环 */
export const MAX_RIM_COLORS = 4
const MIN_RIM_COLORS = 2

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i

export function srgbToLinear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
}

function linearToSrgb255(channel: number): number {
  const s = channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055
  return Math.round(Math.min(1, Math.max(0, s)) * 255)
}

/**
 * 把线性色写回 CSS 颜色串，供 WebGL 不可用时的静态兜底用。
 * 不这么做的话兜底色会比着色器里暗一大截——两边必须走同一套色彩空间。
 */
export function toCssColor(color: LinearRGB, alpha = 1): string {
  const [r, g, b] = color.map(linearToSrgb255)
  return `rgb(${r} ${g} ${b} / ${alpha})`
}

/** 接受 `#rgb` / `#rrggbb`（前缀 `#` 可省），其余一律返回 null 由调用方兜底 */
export function parseHexColor(value: string): LinearRGB | null {
  const matched = HEX.exec(value.trim())
  if (matched === null) {
    return null
  }
  const digits = matched[1]
  const perChannel = digits.length / 3
  const rgb: number[] = []
  for (let index = 0; index < 3; index += 1) {
    const slice = digits.slice(index * perChannel, (index + 1) * perChannel)
    const byte = perChannel === 2 ? Number.parseInt(slice, 16) : Number.parseInt(slice, 16) * 0x11
    rgb.push(srgbToLinear(byte / 255))
  }
  return [rgb[0], rgb[1], rgb[2]]
}

export type RimPalette = {
  /** 实际参与成环的颜色数，已夹在 2..4 */
  count: number
  /** 长度恒为 MAX_RIM_COLORS * 3，未使用的槽位补黑，着色器按 count 取用 */
  rgb: number[]
}

/**
 * 非法项直接丢掉而不是整体兜底：传了 5 个色就取前 4 个，传了 1 个好色 + 1 个错拼才退回默认，
 * 这样改配置时不会因为一个笔误让整颗球突然变成别人的配色。
 */
export function resolveRimColors(colors: readonly string[] | undefined): RimPalette {
  let parsed = (colors ?? []).map(parseHexColor).filter((c): c is LinearRGB => c !== null)
  if (parsed.length < MIN_RIM_COLORS) {
    parsed = FALLBACK_COLORS.map((hex) => parseHexColor(hex) as LinearRGB)
  }
  const used = parsed.slice(0, MAX_RIM_COLORS)
  const rgb = new Array<number>(MAX_RIM_COLORS * 3).fill(0)
  used.forEach((color, index) => {
    rgb[index * 3] = color[0]
    rgb[index * 3 + 1] = color[1]
    rgb[index * 3 + 2] = color[2]
  })
  return { count: used.length, rgb }
}
