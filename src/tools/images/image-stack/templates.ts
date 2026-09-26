import { equalGrid, type GridTemplate } from './image-stack.service'

/** 拼接默认取目录里的第一个版式（均匀网格族），具体形状随素材张数变 */
export const DEFAULT_STITCH_TEMPLATE = 'gen-0'
export const DEFAULT_SPLIT_TEMPLATE = 'split-3x3'
export const SPLIT_CUSTOM_TEMPLATE = 'split-custom'
export const STITCH_CUSTOM_TEMPLATE = 'stitch-custom'

function splitPreset(cols: number, rows: number): GridTemplate {
  return equalGrid(`split-${cols}x${rows}`, cols, rows)
}

/**
 * 拆分预设只留「一眼看出形状」的二维网格；一维切分由自定义的方向 + 份数覆盖。
 * 拼接不用这张表 —— 它的版式由 layouts.ts 按张数成套生成。
 */
export const SPLIT_TEMPLATES: readonly GridTemplate[] = [
  splitPreset(2, 2),
  splitPreset(3, 2),
  splitPreset(2, 3),
  splitPreset(3, 3),
  splitPreset(3, 6),
  splitPreset(3, 9),
  splitPreset(4, 4),
]

export function findTemplate(
  templates: readonly GridTemplate[],
  id: string,
  fallbackId: string,
): GridTemplate {
  return (
    templates.find((template) => template.id === id) ??
    templates.find((template) => template.id === fallbackId) ??
    templates[0]
  )
}
