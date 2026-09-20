import { Copy, Pencil, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

import { A4_HEIGHT_PX, A4_WIDTH_MM, PX_PER_MM } from '../constants'
import { getTemplateForResume } from '../templates/registry'
import { TemplateSurface } from '../templates/TemplateSurface'
import type { ResumeData } from '../types'

const A4_WIDTH_PX = A4_WIDTH_MM * PX_PER_MM

const FOOTER_BUTTON = 'h-full flex-1 rounded-none font-medium'

type ResumeCardProps = {
  resume: ResumeData
  onOpen: () => void
  onRename: (title: string) => void
  onDuplicate: () => void
  onDelete: () => void
}

/** 卡片标题：点击进入行内改名，失焦或回车提交（改名在编辑器顶栏同样可做） */
function CardTitle({ title, onCommit }: { title: string; onCommit: (next: string) => void }) {
  const { t } = useTranslation('tools-resume')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(title)

  if (!editing) {
    return (
      <button
        type="button"
        className="hover:text-primary min-w-0 truncate text-left text-[15px] font-semibold"
        title={t('resume.mine.rename')}
        onClick={() => {
          setDraft(title)
          setEditing(true)
        }}
      >
        {title}
      </button>
    )
  }

  const commit = () => {
    setEditing(false)
    const next = draft.trim()
    if (next && next !== title) {
      onCommit(next)
    }
  }

  return (
    <Input
      autoFocus
      value={draft}
      aria-label={t('resume.mine.renamePrompt')}
      className="h-7 min-w-0 flex-1 text-sm"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.currentTarget.blur()
        }
        if (event.key === 'Escape') {
          setEditing(false)
        }
      }}
    />
  )
}

/**
 * 简历卡片：按 A4 比例缩略图 + 底部三键操作条。
 *
 * 缩略图是真渲染——把整张 A4 按容器宽度等比缩小，所以列表里看到的就是简历本来的样子。
 * 图层整体 pointer-events-none：否则章节外壳的悬停高亮和点击选中会跑到列表页来。
 */
export function ResumeCard({ resume, onOpen, onRename, onDuplicate, onDelete }: ResumeCardProps) {
  const { t, i18n } = useTranslation('tools-resume')
  const hostRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0)

  useEffect(() => {
    const node = hostRef.current
    if (!node) {
      return
    }

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0
      if (width > 0) {
        setScale(width / A4_WIDTH_PX)
      }
    })
    observer.observe(node)

    return () => observer.disconnect()
  }, [])

  const template = getTemplateForResume(resume.templateId)
  const settings = resume.globalSettings
  const updated = new Intl.DateTimeFormat(i18n.language, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(resume.updatedAt))

  return (
    <Card className="group relative aspect-[210/297] gap-0 overflow-hidden p-0 transition-all hover:shadow-lg">
      <CardContent className="bg-muted/40 relative flex-1 p-0">
        <div ref={hostRef} className="pointer-events-none absolute inset-0 overflow-hidden">
          {scale > 0 && (
            <div
              className="resume-paper absolute top-0 left-0 bg-white"
              style={{
                width: `${A4_WIDTH_PX}px`,
                height: `${A4_HEIGHT_PX}px`,
                transform: `scale(${scale})`,
                transformOrigin: 'top left',
                padding: `${settings.pagePadding}px`,
                fontFamily: settings.fontFamily,
                color: template.colorScheme.text,
              }}
            >
              <TemplateSurface data={resume} template={template} />
            </div>
          )}
        </div>

        <button
          type="button"
          aria-label={t('resume.mine.open')}
          className="absolute inset-0 cursor-pointer"
          onClick={onOpen}
        />

        <div className="from-card via-card/90 pointer-events-none absolute inset-x-0 top-[58%] bottom-0 bg-gradient-to-t" />

        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-0.5 px-4 pt-10 pb-3">
          <CardTitle title={resume.title} onCommit={onRename} />
          <span className="text-muted-foreground truncate text-[11px] font-medium">
            {t('resume.mine.meta', {
              template: t(`resume.templates.list.${template.id}.name`),
              time: updated,
            })}
          </span>
        </div>
      </CardContent>

      <CardFooter className="bg-muted/30 z-10 h-11 shrink-0 divide-x border-t p-0">
        <Button variant="ghost" size="sm" className={FOOTER_BUTTON} onClick={onOpen}>
          <Pencil className="size-3.5" />
          {t('resume.mine.edit')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={FOOTER_BUTTON}
          title={t('resume.mine.duplicate')}
          onClick={onDuplicate}
        >
          <Copy className="size-3.5" />
          {t('resume.mine.duplicate')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={`${FOOTER_BUTTON} text-destructive`}
          title={t('resume.mine.delete')}
          onClick={onDelete}
        >
          <Trash2 className="size-3.5" />
          {t('resume.mine.delete')}
        </Button>
      </CardFooter>
    </Card>
  )
}
