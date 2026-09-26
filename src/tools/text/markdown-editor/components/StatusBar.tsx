import { AlertTriangle, Check, LoaderCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { SaveStatus, TextStats, ViewMode, CursorPosition } from '../markdown-editor.types'

interface StatusBarProps {
  cursor: CursorPosition
  stats: TextStats
  saveStatus: SaveStatus
  viewMode: ViewMode
}

const SAVE_ICONS: Record<SaveStatus, typeof Check> = {
  saved: Check,
  saving: LoaderCircle,
  error: AlertTriangle,
}

/** 状态栏：光标行列 / 字符与词数 / 保存状态 / 当前视图模式 */
export function StatusBar({ cursor, stats, saveStatus, viewMode }: StatusBarProps) {
  const { t } = useTranslation('tools-text')
  const SaveIcon = SAVE_ICONS[saveStatus]

  return (
    <div
      className="text-muted-foreground bg-background border-border flex h-8 shrink-0 items-center gap-3 overflow-x-auto border-t px-3 text-xs"
      role="status"
    >
      <span className="shrink-0 tabular-nums">
        {t('markdown-editor.statusCursor', { line: cursor.line, column: cursor.column })}
      </span>
      <span className="shrink-0 tabular-nums">
        {t('markdown-editor.statusStats', {
          chars: stats.chars,
          words: stats.words,
          lines: stats.lines,
        })}
      </span>
      <span className="text-muted-foreground flex shrink-0 items-center gap-1">
        <SaveIcon className={saveStatus === 'saving' ? 'size-3 animate-spin' : 'size-3'} />
        {t(`markdown-editor.save-${saveStatus}`)}
      </span>
      <span className="ml-auto shrink-0">{t(`markdown-editor.mode-${viewMode}`)}</span>
    </div>
  )
}
