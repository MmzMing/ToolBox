import { useStore } from '@xyflow/react'

import type { AlignLine } from '../ai-image-gen.service'

/**
 * 拖动途中的对齐辅助线。存的是画布坐标，屏幕位置每帧按当前平移缩放现算，
 * 所以挪动与缩放时它跟着走；松手即随拖拽状态一起消失。
 *
 * 跨度只盖住对齐的那两张卡片，不铺满视口：全视窗的长线会把注意力从卡片上抢走。
 * 只画线不改落位，位置完全由手定。
 */
export function AlignLines({ lines }: { lines: AlignLine[] }) {
  const [tx, ty, zoom] = useStore((state) => state.transform)
  if (!lines.length) {
    return null
  }
  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      {lines.map((line) => {
        // 落点取整到设备像素：1px 的线压在两个像素之间时会发虚，平移时看着像在抖
        const vertical = line.axis === 'x'
        const x = vertical ? line.pos * zoom + tx : line.from * zoom + tx
        const y = vertical ? line.from * zoom + ty : line.pos * zoom + ty
        return (
          <span
            // 键不带跨度：拖拽时每帧长度都在变，键一变 React 就重建节点
            key={`${line.axis}:${line.pos}`}
            aria-hidden
            className="bg-foreground absolute"
            style={
              vertical
                ? {
                    left: Math.round(x),
                    top: Math.round(y),
                    width: 1,
                    height: (line.to - line.from) * zoom,
                  }
                : {
                    left: Math.round(x),
                    top: Math.round(y),
                    height: 1,
                    width: (line.to - line.from) * zoom,
                  }
            }
          />
        )
      })}
    </div>
  )
}
