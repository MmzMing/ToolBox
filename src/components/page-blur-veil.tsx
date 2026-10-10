import { cn } from '@/lib/utils'

/**
 * 页面切换的显影层：一层空的 backdrop-blur 覆盖，把模糊半径收到 0，
 * 新页面像对焦一样浮现。不给内容套盒，所以沉浸工具的高度链、`<main>`
 * 滚动区与 sticky 都不受影响（关键帧见 index.css）。
 *
 * 动画靠重挂载重播：调用方用路由路径当 key。
 */
export function PageBlurVeil({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn('page-blur-veil pointer-events-none absolute inset-0 z-30', className)}
    />
  )
}
