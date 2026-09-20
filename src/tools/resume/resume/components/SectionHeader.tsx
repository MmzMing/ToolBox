import { Pencil } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

import { useResumeStore } from '../store'
import { SectionIcon } from './SectionIcon'

type SectionHeaderProps = {
  sectionId: string
  title: string
  /** 基本信息章节的标题固定，不允许改名 */
  locked?: boolean
}

/** 章节卡头：图标 + 可就地改名的标题（改名写进 menuSections，属于用户数据） */
export function SectionHeader({ sectionId, title, locked = false }: SectionHeaderProps) {
  const { t } = useTranslation('tools-resume')
  const resume = useResumeStore((state) => state.activeResume)
  const updateMenuSections = useResumeStore((state) => state.updateMenuSections)
  const [editing, setEditing] = useState(false)
  /** null 表示没有本地草稿，直接显示数据里的标题，省掉一个同步 effect */
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? title

  const icon = resume?.menuSections.find((section) => section.id === sectionId)?.icon

  const commit = () => {
    const next = shown.trim()
    setEditing(false)
    setDraft(null)
    if (!next || next === title || !resume) {
      return
    }
    updateMenuSections(
      resume.menuSections.map((section) =>
        section.id === sectionId ? { ...section, title: next } : section,
      ),
    )
  }

  return (
    <div className="flex items-center gap-2">
      {icon && <SectionIcon name={icon} className="text-muted-foreground size-4" />}

      {editing ? (
        <Input
          autoFocus
          value={shown}
          aria-label={t('resume.section.rename')}
          className="h-7 min-w-0 flex-1 text-sm"
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.currentTarget.blur()
            }
            if (event.key === 'Escape') {
              setEditing(false)
              setDraft(null)
            }
          }}
        />
      ) : (
        <h3 className={cn('truncate text-sm font-medium', locked && 'text-muted-foreground')}>
          {title}
        </h3>
      )}

      {!locked && !editing && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t('resume.section.rename')}
              onClick={() => {
                setDraft(null)
                setEditing(true)
              }}
            >
              <Pencil className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{t('resume.section.rename')}</TooltipContent>
        </Tooltip>
      )}
    </div>
  )
}
