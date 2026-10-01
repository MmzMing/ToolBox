import type { SVGProps } from 'react'

/** AI 生图画布工具图标（Iconify: hugeicons:canvas） */
export function AiImageGenIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M4 8c0-2.828 0-4.243 1.004-5.121S7.624 2 10.857 2h2.286c3.232 0 4.849 0 5.853.879C20 3.757 20 5.172 20 8v9H4z" />
      <path d="M3 17h18" />
      <path d="M10.699 5.566c1.23-.176 3.268-.106 1.581 1.587c-2.108 2.115-5.272 6.876-1.581 5.29c3.69-1.588 5.272-.53 3.69 1.057" />
      <path d="M12 17v4m-7 1l3-5m11 5l-3-5" />
    </svg>
  )
}
