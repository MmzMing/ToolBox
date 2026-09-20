import { Reorder } from 'motion/react'

import { useResumeStore } from '../../store'
import { LayoutItem } from './LayoutItem'
import type { MenuSection } from '../../types'

type LayoutSettingProps = {
  menuSections: MenuSection[]
  activeSection: string
  /** 选中章节后的附加动作：dock 浮层用它收起自己，左栏不传 */
  onSectionSelect?: (sectionId: string) => void
}

/** 章节列表：basic 钉在顶部不参与排序，其余拖拽调整显示顺序 */
export function LayoutSetting({
  menuSections,
  activeSection,
  onSectionSelect,
}: LayoutSettingProps) {
  const reorderSections = useResumeStore((state) => state.reorderSections)
  const basicSection = menuSections.find((section) => section.id === 'basic')
  const draggableSections = menuSections.filter((section) => section.id !== 'basic')

  return (
    <div className="flex flex-col gap-2">
      {basicSection && (
        <LayoutItem
          item={basicSection}
          activeSection={activeSection}
          pinned
          onSectionSelect={onSectionSelect}
        />
      )}

      <Reorder.Group
        axis="y"
        values={draggableSections}
        onReorder={reorderSections}
        className="flex flex-col gap-2"
      >
        {draggableSections.map((item) => (
          <LayoutItem
            key={item.id}
            item={item}
            activeSection={activeSection}
            onSectionSelect={onSectionSelect}
          />
        ))}
      </Reorder.Group>
    </div>
  )
}
