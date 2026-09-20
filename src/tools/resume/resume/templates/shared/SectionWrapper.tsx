import { cn } from '@/lib/utils'
import type { CSSProperties, ReactNode } from 'react'

import { useResumeStore } from '../../store'

type SectionWrapperProps = {
  sectionId: string
  children: ReactNode
  className?: string
  style?: CSSProperties
}

/**
 * 所有 section 的外壳：提供悬停高亮与「点击预览中的章节 = 选中该章节」的反向定位。
 *
 * 这里刻意不用 motion 包一层：本组件没有 layout 动画需求，而 `motion` 会在节点上留下
 * 内联 transform，导出时可能正好被光栅化捕获。
 */
export function SectionWrapper({ sectionId, children, className, style }: SectionWrapperProps) {
  const setActiveSection = useResumeStore((state) => state.setActiveSection)

  return (
    <div
      data-resume-section-id={sectionId}
      className={cn(
        'rounded-md transition-all duration-300 ease-in-out hover:cursor-pointer hover:shadow-md',
        'hover:bg-[#f9f8f3]',
        className,
      )}
      style={style}
      onClick={() => setActiveSection(sectionId)}
    >
      {children}
    </div>
  )
}

export default SectionWrapper
