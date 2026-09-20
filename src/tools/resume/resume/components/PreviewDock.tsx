import {
  Copy,
  Eye,
  EyeOff,
  FileText,
  Home,
  LayoutList,
  Palette,
  Pencil,
  Rows3,
  SlidersHorizontal,
  Type,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'

import { Dock, DockDivider, DockIcon, DockPopoverKey } from './Dock'
import { FaqDialog } from './FaqDialog'
import { ExportDialog } from './ExportDialog'
import { TemplateSheet } from './TemplateSheet'
import { ModePanel } from './dock-panels/ModePanel'
import { SectionsPanel } from './dock-panels/SectionsPanel'
import { SpacingPanel } from './dock-panels/SpacingPanel'
import { ThemePanel } from './dock-panels/ThemePanel'
import { TypographyPanel } from './dock-panels/TypographyPanel'
import { useResumeStore } from '../store'
import type { ResumeLocale } from '../store'

export type PanelKey = 'edit' | 'preview'

/** dock 上会展开浮层的键位，对应原左栏的五组设置 */
type DockPanelKey = 'sections' | 'theme' | 'typography' | 'spacing' | 'mode'

type PreviewDockProps = {
  collapsed: Record<PanelKey, boolean>
  onToggle: (panel: PanelKey) => void
}

/**
 * 预览区右侧的悬浮工具条。
 *
 * 桌面端没有左栏，五组设置以浮层形式挂在这里。旧版另有「AI 语法检查」与
 * 「仓库外链」两键：前者需要后端，后者指向旧项目，都不在本项目范围内。
 */
export function PreviewDock({ collapsed, onToggle }: PreviewDockProps) {
  const { t, i18n } = useTranslation('tools-resume')
  const navigate = useNavigate()
  const autoOnePage = useResumeStore((state) => state.activeResume?.globalSettings.autoOnePage)
  const pageBreakLinesVisible = useResumeStore(
    (state) => state.activeResume?.globalSettings.pageBreakLinesVisible !== false,
  )
  const updateGlobalSettings = useResumeStore((state) => state.updateGlobalSettings)
  const duplicateResume = useResumeStore((state) => state.duplicateResume)
  const activeResumeId = useResumeStore((state) => state.activeResumeId)
  const [openPanel, setOpenPanel] = useState<DockPanelKey | null>(null)

  const locale: ResumeLocale = i18n.language.startsWith('en') ? 'en' : 'zh'

  /** 同一时刻只开一个浮层：开新的就顶掉旧的 */
  const handleOpenChange = (key: DockPanelKey) => (next: boolean) =>
    setOpenPanel((prev) => (next ? key : prev === key ? null : prev))

  const panelKeys: Array<{ key: DockPanelKey; label: string; icon: typeof LayoutList }> = [
    { key: 'sections', label: t('resume.dock.sections'), icon: LayoutList },
    { key: 'theme', label: t('resume.dock.theme'), icon: Palette },
    { key: 'typography', label: t('resume.dock.typography'), icon: Type },
    { key: 'spacing', label: t('resume.dock.spacing'), icon: Rows3 },
    { key: 'mode', label: t('resume.dock.mode'), icon: SlidersHorizontal },
  ]

  // 用函数调用而不是内联组件类型：内联箭头组件每次渲染都是新类型，会让浮层内容整树重挂载
  const panelContent: Record<DockPanelKey, () => React.ReactNode> = {
    sections: () => <SectionsPanel onSectionSelect={() => setOpenPanel(null)} />,
    theme: () => <ThemePanel />,
    typography: () => <TypographyPanel />,
    spacing: () => <SpacingPanel />,
    mode: () => <ModePanel />,
  }

  return (
    <div className="fixed top-1/2 right-3 z-50 hidden max-h-[calc(100svh-1.5rem)] -translate-y-1/2 flex-col items-center gap-3 md:flex">
      <Dock>
        {panelKeys.map(({ key, label, icon }) => (
          <DockPopoverKey
            key={key}
            label={label}
            icon={icon}
            open={openPanel === key}
            onOpenChange={handleOpenChange(key)}
          >
            {openPanel === key ? panelContent[key]() : null}
          </DockPopoverKey>
        ))}

        <DockDivider />

        <DockIcon label={t('resume.dock.switchTemplate')}>
          <TemplateSheet />
        </DockIcon>

        <DockIcon
          label={t('resume.dock.autoOnePage')}
          active={Boolean(autoOnePage)}
          onClick={() => {
            updateGlobalSettings({ autoOnePage: !autoOnePage })
            toast.success(
              autoOnePage ? t('resume.dock.autoOnePageOff') : t('resume.dock.autoOnePageOn'),
            )
          }}
        >
          <FileText className="size-4" />
        </DockIcon>

        <DockIcon
          label={t('resume.dock.pageBreakLines')}
          active={!pageBreakLinesVisible}
          onClick={() => {
            updateGlobalSettings({ pageBreakLinesVisible: !pageBreakLinesVisible })
            toast.success(
              pageBreakLinesVisible
                ? t('resume.dock.pageBreakHidden')
                : t('resume.dock.pageBreakShown'),
            )
          }}
        >
          {pageBreakLinesVisible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
        </DockIcon>

        <DockDivider />

        <DockIcon label={t('resume.dock.export')}>
          <ExportDialog />
        </DockIcon>

        <DockIcon
          label={t('resume.dock.copy')}
          onClick={() => {
            if (!activeResumeId) {
              return
            }
            const newId = duplicateResume(activeResumeId, locale)
            if (newId) {
              toast.success(t('resume.dock.copied'))
              navigate(`/resume/${newId}`)
            }
          }}
        >
          <Copy className="size-4" />
        </DockIcon>

        <DockDivider />

        <DockIcon
          label={collapsed.edit ? t('resume.dock.expandEdit') : t('resume.dock.collapseEdit')}
          active={!collapsed.edit}
          onClick={() => onToggle('edit')}
        >
          <Pencil className="size-4" />
        </DockIcon>

        <DockIcon
          label={
            collapsed.preview ? t('resume.dock.expandPreview') : t('resume.dock.collapsePreview')
          }
          active={!collapsed.preview}
          onClick={() => onToggle('preview')}
        >
          <Eye className="size-4" />
        </DockIcon>

        <DockDivider />

        <DockIcon label={t('resume.dock.home')} onClick={() => navigate('/resume')}>
          <Home className="size-4" />
        </DockIcon>
      </Dock>

      <FaqDialog />
    </div>
  )
}
