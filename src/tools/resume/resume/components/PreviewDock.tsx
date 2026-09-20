import { Copy, Eye, EyeOff, FileText, Home, Pencil, SpellCheck2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'

import { Dock, DockDivider, DockIcon } from './Dock'
import { FaqDialog } from './FaqDialog'
import { ExportDialog } from './ExportDialog'
import { TemplateSheet } from './TemplateSheet'
import { GrammarCheckDrawer } from './ai/GrammarCheckDrawer'
import { useGrammarCheck } from './ai/useGrammarCheck'
import { useAIEnabled, useTaskModel } from './ai/useAIGate'
import { useResumeStore } from '../store'
import type { ResumeLocale } from '../store'

export type PanelKey = 'edit' | 'preview'

type PreviewDockProps = {
  collapsed: Record<PanelKey, boolean>
  onToggle: (panel: PanelKey) => void
}

/**
 * 预览区右侧的悬浮工具条。
 *
 * 五组设置挂在顶栏的 LayoutToolbar 上：放这里时 dock 高 555px，矮屏笔记本会顶出视口。
 * 旧版另有「AI 润色」与「仓库外链」两键：前者需要后端，后者指向旧项目，都不在本项目范围内。
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
  const aiEnabled = useAIEnabled()
  const textModel = useTaskModel('text')
  const grammar = useGrammarCheck(aiEnabled ? textModel : null)

  const locale: ResumeLocale = i18n.language.startsWith('en') ? 'en' : 'zh'

  return (
    <div className="fixed top-1/2 right-3 z-50 hidden max-h-[calc(100svh-1.5rem)] -translate-y-1/2 flex-col items-center gap-3 md:flex">
      <Dock>
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

        {aiEnabled && (
          <DockIcon
            label={
              grammar.items.length
                ? t('resume.dock.grammarResults', { count: grammar.items.length })
                : t('resume.dock.grammar')
            }
            active={grammar.items.length > 0}
            disabled={grammar.checking}
            onClick={() => {
              if (grammar.items.length && !grammar.drawerOpen) {
                grammar.setDrawerOpen(true)
                return
              }
              void grammar.run()
            }}
          >
            <SpellCheck2 className="size-4" />
          </DockIcon>
        )}

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

      {aiEnabled && <GrammarCheckDrawer check={grammar} />}
    </div>
  )
}
