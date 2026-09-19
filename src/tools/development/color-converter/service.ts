import { colord, extend } from 'colord'
import cmykPlugin from 'colord/plugins/cmyk'
import hwbPlugin from 'colord/plugins/hwb'
import lchPlugin from 'colord/plugins/lch'
import namesPlugin from 'colord/plugins/names'

extend([cmykPlugin, hwbPlugin, lchPlugin, namesPlugin])

export const COLOR_FORMATS = ['hex', 'rgb', 'hsl', 'hwb', 'lch', 'cmyk', 'name'] as const

export type ColorFormat = (typeof COLOR_FORMATS)[number]

export type ColorValues = Record<ColorFormat, string>

/** CSS 不接受省略 # 的裸 hex，这里补上，让粘贴板里的 '1ea54c' 也能用 */
function normalizeBareHex(input: string): string {
  return /^[0-9a-f]{3}$|^[0-9a-f]{6}$/i.test(input) ? `#${input}` : input
}

/**
 * 解析任意 CSS 颜色写法（hex / rgb / hsl / hwb / lch / cmyk / 颜色名），返回七种格式。
 * 输出统一去掉 alpha（取色器只接受 6 位 hex），大小写不敏感；非法或空输入返回 null。
 */
export function tryParseColor(input: string): ColorValues | null {
  const trimmed = input.trim()
  if (trimmed === '') {
    return null
  }
  const parsed = colord(normalizeBareHex(trimmed))
  if (!parsed.isValid()) {
    return null
  }
  const color = colord(parsed.toHex().slice(0, 7))
  return {
    hex: color.toHex(),
    rgb: color.toRgbString(),
    hsl: color.toHslString(),
    hwb: color.toHwbString(),
    lch: color.toLchString(),
    cmyk: color.toCmykString(),
    name: color.toName({ closest: true }) ?? 'unknown',
  }
}

/** tryParseColor 的抛错版本，供需要显式错误分支的调用方使用 */
export function parseColor(input: string): ColorValues {
  const values = tryParseColor(input)
  if (values === null) {
    throw new Error(`Invalid color: "${input}"`)
  }
  return values
}
