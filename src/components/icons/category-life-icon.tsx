import type { SVGProps } from 'react'

/**
 * 「生活」分类图标（Iconify 导出片段，48 网格描边型：开门的小屋）。
 *
 * 原片段没写 stroke-width，默认 1 在 16–20px 下只有 0.4px，比同排的 lucide 图标细一档，
 * 因此补成 4/48 = 2/24，与 lucide 的视觉笔画宽度对齐。
 */
export function CategoryLifeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth={4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="m29.02 26.218l-3.325 2.747V43.5l5.414-4.54h8.986V15.244L24 4.5L7.905 15.244V38.96h10.97" />
    </svg>
  )
}
