import type { SVGProps } from 'react'

/**
 * 简历工坊工具图标（Iconify SVG，20 网格：带人像与文字行的文档，右上角折角用描边）
 *
 * 20 网格与站点常用尺寸接近 1:1，折角那条 1 用户单位的描边在侧栏 16px 下渲染 0.8px，
 * 因此不需要像 48 网格图标那样额外补 stroke-width。
 */
export function ResumeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      <path
        fill="currentColor"
        d="M6.5 12.5a.5.5 0 0 1 0-1h7a.5.5 0 0 1 0 1zm0 2.5a.5.5 0 0 1 0-1h7a.5.5 0 0 1 0 1z"
      />
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M11.185 1H4.5A1.5 1.5 0 0 0 3 2.5v15A1.5 1.5 0 0 0 4.5 19h11a1.5 1.5 0 0 0 1.5-1.5V7.202a1.5 1.5 0 0 0-.395-1.014l-4.314-4.702A1.5 1.5 0 0 0 11.185 1M4 2.5a.5.5 0 0 1 .5-.5h6.685a.5.5 0 0 1 .369.162l4.314 4.702a.5.5 0 0 1 .132.338V17.5a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5z"
        clipRule="evenodd"
      />
      <path
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M11.5 2.1v4.7h4.7"
      />
      <path
        fill="currentColor"
        d="M8.134 6.133a1.067 1.067 0 1 0 0-2.133a1.067 1.067 0 0 0 0 2.133"
      />
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M10.266 8.444c0-1.134-.955-1.955-2.133-1.955S6 7.309 6 8.444v.534a.356.356 0 0 0 .356.355h3.555a.356.356 0 0 0 .355-.355z"
        clipRule="evenodd"
      />
    </svg>
  )
}
