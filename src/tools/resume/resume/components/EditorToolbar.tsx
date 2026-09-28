import { Copy, Redo2, SeparatorHorizontal, Shrink, SpellCheck2, Undo2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

import { GrammarCheckDrawer } from './ai/GrammarCheckDrawer'
import { useGrammarCheck } from './ai/useGrammarCheck'
import { useAIEnabled, useTaskModel } from './ai/useAIGate'
import { useResumeStore } from '../store'
import type { ResumeLocale } from '../store'
import type { PanelKey } from '../editor-ui'

/** 视图档位：只剩哪栏就选哪栏，两栏都在＝全部 */
const VIEW_MODES = ['edit', 'preview', 'all'] as const
type ViewMode = (typeof VIEW_MODES)[number]

type ToolbarButtonProps = {
  icon: typeof Copy
  label: string
  /** 提示与无障碍名：比 label 更完整的说法，窄屏只剩图标时靠它表意 */
  hint?: string
  active?: boolean
  disabled?: boolean
  /** 只在宽屏出现的视图开关：手机上顶栏挤不下，只留撤销重做 */
  desktopOnly?: boolean
  onClick?: () => void
}

/** 顶栏键位：无边框无背景，图标 + 文字（窄屏只留图标） */
function ToolbarButton({
  icon: Icon,
  label,
  hint,
  active,
  disabled,
  desktopOnly,
  onClick,
}: ToolbarButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={disabled}
      aria-label={hint ?? label}
      title={hint ?? label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'shrink-0 gap-1.5',
        active && 'text-primary hover:text-primary',
        desktopOnly && 'hidden md:inline-flex',
      )}
    >
      <Icon className="size-4" />
      <span className="hidden xl:inline">{label}</span>
    </Button>
  )
}

type EditorToolbarProps = {
  collapsed: Record<PanelKey, boolean>
  /** 操作 / 预览 / 全部：一次设定两栏的显隐 */
  onSetPanels: (next: Record<PanelKey, boolean>) => void
}

/**
 * 顶栏操作组：视图档位、复制简历、纸张开关与撤销重做。
 *
 * 视图档位排在最前（未备份之后），用文字而不是图标——"操作/预览"两颗眼睛按钮太容易认错。
 */
export function EditorToolbar({ collapsed, onSetPanels }: EditorToolbarProps) {
  const { t, i18n } = useTranslation('tools-resume')
  const navigate = useNavigate()
  const autoOnePage = useResumeStore((state) => state.activeResume?.globalSettings.autoOnePage)
  const pageBreakLinesVisible = useResumeStore(
    (state) => state.activeResume?.globalSettings.pageBreakLinesVisible !== false,
  )
  const updateGlobalSettings = useResumeStore((state) => state.updateGlobalSettings)
  const duplicateResume = useResumeStore((state) => state.duplicateResume)
  const activeResumeId = useResumeStore((state) => state.activeResumeId)
  const canUndo = useResumeStore(
    (state) => (state.history[state.activeResumeId ?? '']?.length ?? 0) > 0,
  )
  const canRedo = useResumeStore(
    (state) => (state.future[state.activeResumeId ?? '']?.length ?? 0) > 0,
  )
  const undo = useResumeStore((state) => state.undo)
  const redo = useResumeStore((state) => state.redo)
  const aiEnabled = useAIEnabled()
  const textModel = useTaskModel('text')
  const grammar = useGrammarCheck(aiEnabled ? textModel : null)

  const locale: ResumeLocale = i18n.language.startsWith('en') ? 'en' : 'zh'
  const viewMode: ViewMode =
    collapsed.edit && !collapsed.preview
      ? 'preview'
      : collapsed.preview && !collapsed.edit
        ? 'edit'
        : 'all'

  return (
    <div className="flex min-w-0 items-center gap-1">
      <Select
        value={viewMode}
        onValueChange={(value) => {
          const mode = value as ViewMode
          onSetPanels({ edit: mode === 'preview', preview: mode === 'edit' })
        }}
      >
        <SelectTrigger
          size="sm"
          className="hidden w-20 md:inline-flex"
          aria-label={t('resume.toolbar.viewMode.label')}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {VIEW_MODES.map((mode) => (
            <SelectItem key={mode} value={mode}>
              {t(`resume.toolbar.viewMode.${mode}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <ToolbarButton
        icon={Copy}
        label={t('resume.toolbar.copy')}
        desktopOnly
        hint={t('resume.dock.copy')}
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
      />

      <ToolbarButton
        icon={Shrink}
        label={t('resume.toolbar.autoOnePage')}
        desktopOnly
        active={Boolean(autoOnePage)}
        onClick={() => {
          updateGlobalSettings({ autoOnePage: !autoOnePage })
          toast.success(
            autoOnePage ? t('resume.dock.autoOnePageOff') : t('resume.dock.autoOnePageOn'),
          )
        }}
      />

      <ToolbarButton
        icon={SeparatorHorizontal}
        label={t('resume.toolbar.pageBreaks')}
        desktopOnly
        hint={t('resume.dock.pageBreakLines')}
        active={pageBreakLinesVisible}
        onClick={() => {
          updateGlobalSettings({ pageBreakLinesVisible: !pageBreakLinesVisible })
          toast.success(
            pageBreakLinesVisible
              ? t('resume.dock.pageBreakHidden')
              : t('resume.dock.pageBreakShown'),
          )
        }}
      />

      {aiEnabled && (
        <ToolbarButton
          icon={SpellCheck2}
          label={t('resume.dock.grammar')}
          active={grammar.items.length > 0}
          disabled={grammar.checking}
          onClick={() => {
            if (grammar.items.length && !grammar.drawerOpen) {
              grammar.setDrawerOpen(true)
              return
            }
            void grammar.run()
          }}
        />
      )}

      <ToolbarButton
        icon={Undo2}
        label={t('resume.editor.undo')}
        disabled={!canUndo}
        onClick={undo}
      />
      <ToolbarButton
        icon={Redo2}
        label={t('resume.editor.redo')}
        disabled={!canRedo}
        onClick={redo}
      />

      {aiEnabled && <GrammarCheckDrawer check={grammar} />}
    </div>
  )
}
