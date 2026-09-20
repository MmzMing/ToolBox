import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LayoutList, Palette, Rows3, SlidersHorizontal, Type } from 'lucide-react'

import { DockPopoverKey } from './Dock'
import { ModePanel } from './dock-panels/ModePanel'
import { SectionsPanel } from './dock-panels/SectionsPanel'
import { SpacingPanel } from './dock-panels/SpacingPanel'
import { ThemePanel } from './dock-panels/ThemePanel'
import { TypographyPanel } from './dock-panels/TypographyPanel'

/** 顶栏上的五组设置：原本挤在右侧 dock 里，把 dock 顶得太长 */
type LayoutKey = 'sections' | 'theme' | 'typography' | 'spacing' | 'mode'

export function LayoutToolbar() {
  const { t } = useTranslation('tools-resume')
  const [openKey, setOpenKey] = useState<LayoutKey | null>(null)

  const keys: Array<{ key: LayoutKey; label: string; icon: typeof LayoutList }> = [
    { key: 'sections', label: t('resume.dock.sections'), icon: LayoutList },
    { key: 'theme', label: t('resume.dock.theme'), icon: Palette },
    { key: 'typography', label: t('resume.dock.typography'), icon: Type },
    { key: 'spacing', label: t('resume.dock.spacing'), icon: Rows3 },
    { key: 'mode', label: t('resume.dock.mode'), icon: SlidersHorizontal },
  ]

  // 用函数调用而不是内联组件类型：内联箭头组件每次渲染都是新类型，会让浮层内容整树重挂载
  const content: Record<LayoutKey, () => React.ReactNode> = {
    sections: () => <SectionsPanel onSectionSelect={() => setOpenKey(null)} />,
    theme: () => <ThemePanel />,
    typography: () => <TypographyPanel />,
    spacing: () => <SpacingPanel />,
    mode: () => <ModePanel />,
  }

  return (
    <div className="hidden items-center gap-1 md:flex">
      {keys.map(({ key, label, icon }) => (
        <DockPopoverKey
          key={key}
          label={label}
          icon={icon}
          side="bottom"
          open={openKey === key}
          onOpenChange={(next) => setOpenKey((prev) => (next ? key : prev === key ? null : prev))}
        >
          {openKey === key ? content[key]() : null}
        </DockPopoverKey>
      ))}
    </div>
  )
}
