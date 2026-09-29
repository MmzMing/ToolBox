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
      {lines.map((line) => (
        <span
          key={`${line.axis}:${line.pos}:${line.from}`}
          aria-hidden
          className="bg-foreground absolute"
          style={
            line.axis === 'x'
              ? {
                  left: line.pos * zoom + tx,
                  top: line.from * zoom + ty,
                  width: 1,
                  height: (line.to - line.from) * zoom,
                }
              : {
                  top: line.pos * zoom + ty,
                  left: line.from * zoom + tx,
                  height: 1,
                  width: (line.to - line.from) * zoom,
                }
          }
        />
      ))}
    </div>
  )
}
