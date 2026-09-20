import { useMemo } from 'react'

import { a4ContentHeight } from './resume.service'

/** 文字再小就不堪读了，自动一页纸最多缩到九成 */
const MIN_SCALE = 0.9

type AutoOnePageInput = {
  /** 纸张元素的实际渲染高度（含上下页边距） */
  contentHeight: number
  pagePadding: number
  enabled: boolean
}

export type AutoOnePageResult = {
  scaleFactor: number
  isScaled: boolean
  /** 内容太多，缩到下限仍放不下 */
  cannotFit: boolean
}

/**
 * 自动一页纸：按可用内容高度整体缩放纸张内容。
 *
 * 算的是减去上下页边距后的净高度，缩放由调用方以 transform 施加在内容容器上。
 */
export function useAutoOnePage({
  contentHeight,
  pagePadding,
  enabled,
}: AutoOnePageInput): AutoOnePageResult {
  return useMemo(() => {
    if (!enabled || contentHeight <= 0) {
      return { scaleFactor: 1, isScaled: false, cannotFit: false }
    }

    const available = a4ContentHeight(pagePadding)
    const actual = contentHeight - pagePadding * 2

    if (available <= 0 || actual <= available) {
      return { scaleFactor: 1, isScaled: false, cannotFit: false }
    }

    const ideal = available / actual
    if (ideal >= MIN_SCALE) {
      return { scaleFactor: ideal, isScaled: true, cannotFit: false }
    }

    return { scaleFactor: MIN_SCALE, isScaled: true, cannotFit: true }
  }, [contentHeight, pagePadding, enabled])
}
