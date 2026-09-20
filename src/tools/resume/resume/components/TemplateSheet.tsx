import { Check, PanelsLeftBottom } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

import { useResumeStore } from '../store'
import { TEMPLATE_CONFIGS, templateSnapshotPath } from '../templates/registry'

/** 编辑器内切换模板：左侧半屏抽屉，九张 A4 比例缩略图 */
export function TemplateSheet() {
  const { t } = useTranslation('tools-resume')
  const templateId = useResumeStore((state) => state.activeResume?.templateId)
  const setTemplate = useResumeStore((state) => state.setTemplate)
  const [open, setOpen] = useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t('resume.templates.switch')}
        >
          <PanelsLeftBottom className="size-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="flex w-1/2 flex-col gap-0 p-0 sm:max-w-1/2">
        <SheetHeader className="border-b">
          <SheetTitle>{t('resume.templates.switch')}</SheetTitle>
          <SheetDescription className="sr-only">{t('resume.templates.hint')}</SheetDescription>
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-3 lg:grid-cols-4">
            {TEMPLATE_CONFIGS.map((template) => {
              const active = template.id === templateId
              return (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => {
                    setTemplate(template.id)
                    setOpen(false)
                  }}
                  className={cn(
                    'group relative overflow-hidden rounded-lg border-2 text-left transition-all hover:scale-[1.02]',
                    active ? 'border-primary shadow-lg' : 'border-border hover:border-primary/50',
                  )}
                >
                  <div className="bg-muted/40 relative aspect-[210/297] overflow-hidden">
                    <img
                      src={templateSnapshotPath(template.layout)}
                      alt={t(`resume.templates.list.${template.id}.name`)}
                      draggable={false}
                      className="h-full w-full object-cover object-top"
                    />
                    {active && (
                      <span className="bg-primary/10 absolute inset-0 flex items-center justify-center">
                        <Check className="text-primary size-8" />
                      </span>
                    )}
                  </div>
                  <p className="truncate px-2 py-1.5 text-xs font-medium">
                    {t(`resume.templates.list.${template.id}.name`)}
                  </p>
                </button>
              )
            })}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
