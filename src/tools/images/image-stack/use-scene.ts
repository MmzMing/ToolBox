import { useMemo } from 'react'

import {
  cropRectForFocus,
  ratioValue,
  resolveCells,
  resolveCanvasSize,
  type GridTemplate,
  type Rect,
  type Scene,
  type Size,
} from './image-stack.service'
import { isReady, type ReadyAsset } from './assets'
import { splitTemplateOf, stitchTemplateOf, useImageStackStore } from './store'

export type RenderableAsset = { source: CanvasImageSource; size: Size }

/** 解码成功的素材，跳过失败项 */
export function useReadyAssets(): ReadyAsset[] {
  const items = useImageStackStore((state) => state.items)
  return useMemo(() => items.filter(isReady), [items])
}

/** 拼接用的完整 scene：画布尺寸由比例与档位现场推出 */
export function useStitchScene(): Scene {
  const ratioKey = useImageStackStore((state) => state.ratioKey)
  const presetKey = useImageStackStore((state) => state.presetKey)
  const customSize = useImageStackStore((state) => state.customSize)
  const style = useImageStackStore((state) => state.style)
  const stitchTemplateId = useImageStackStore((state) => state.stitchTemplateId)
  const stitchCells = useImageStackStore((state) => state.stitchCells)
  const stitchCols = useImageStackStore((state) => state.stitchCols)
  const stitchRows = useImageStackStore((state) => state.stitchRows)
  const layers = useImageStackStore((state) => state.layers)

  return useMemo(
    () => ({
      // 自定义尺寸经 store 的 clampCustomSize 收敛过，这里不会再抛
      canvas: resolveCanvasSize(ratioKey, presetKey, customSize),
      style,
      // 张数由模板区自己定，与素材数无关，所以一张图也能铺进多格
      template: stitchTemplateOf(stitchTemplateId, stitchCells, stitchCols, stitchRows),
      layers,
    }),
    [
      ratioKey,
      presetKey,
      customSize,
      style,
      stitchTemplateId,
      stitchCells,
      stitchCols,
      stitchRows,
      layers,
    ],
  )
}

/**
 * 按 imageId 取位图。preview 用降采样图跑交互，full 用原图跑导出，
 * 两级尺寸不同但都是等比的，resolvePlacement 按比例算所以结果一致。
 */
export function useAssetResolver(tier: 'preview' | 'full') {
  const assets = useReadyAssets()
  return useMemo(() => {
    const lookup = new Map<string, ReadyAsset>(assets.map((asset) => [asset.id, asset]))
    return (imageId: string): RenderableAsset | null => {
      const asset = lookup.get(imageId)
      if (!asset) {
        return null
      }
      const bitmap = tier === 'full' ? asset.full : asset.preview
      return { source: bitmap, size: { width: bitmap.width, height: bitmap.height } }
    }
  }, [assets, tier])
}

export type SplitGeometry = {
  source: ReadyAsset
  /** 比例感知裁切后落在源图上的区域 */
  crop: Rect
  /** 裁切区内已 snap 到整数像素的切片矩形，顺序与模板单元格一致，直接用于导出 */
  cells: Rect[]
  template: GridTemplate
}

export function useSplitGeometry(): SplitGeometry | null {
  const items = useImageStackStore((state) => state.items)
  const splitSourceId = useImageStackStore((state) => state.splitSourceId)
  const splitTemplateId = useImageStackStore((state) => state.splitTemplateId)
  const splitCols = useImageStackStore((state) => state.splitCols)
  const splitRows = useImageStackStore((state) => state.splitRows)
  const splitFocus = useImageStackStore((state) => state.splitFocus)
  const ratioKey = useImageStackStore((state) => state.ratioKey)

  return useMemo(() => {
    const found = items.find((item) => item.id === splitSourceId)
    if (!found || !isReady(found)) {
      return null
    }
    const template = splitTemplateOf(splitTemplateId, splitCols, splitRows)
    const crop = cropRectForFocus(
      { width: found.width, height: found.height },
      ratioValue(ratioKey),
      splitFocus,
    )
    return {
      source: found,
      crop,
      cells: resolveCells(template, crop, { padding: 0, gap: 0 }, true),
      template,
    }
  }, [items, splitSourceId, splitTemplateId, splitCols, splitRows, splitFocus, ratioKey])
}
