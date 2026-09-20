import { ChevronRight, FilePlus2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'

import { TEMPLATE_CONFIGS, templateSnapshotPath } from '../templates/registry'

type CreateResumeDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** null 表示空白简历 */
  onCreate: (templateId: string | null) => void
}

function RuleHeading({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-6">
      <h3 className="shrink-0 text-sm font-medium">{children}</h3>
      <div className="bg-border h-px flex-1" />
    </div>
  )
}

/**
 * 新建简历弹窗：从空白开始 + 模板墙。
 *
 * 模板截图是静态 PNG（public/template-snapshots），不是实时渲染——
 * 一屏九份 A4 同时渲染会让弹窗打开明显卡顿。
 */
export function CreateResumeDialog({ open, onOpenChange, onCreate }: CreateResumeDialogProps) {
  const { t } = useTranslation('tools-resume')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[85svh] max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[1100px]">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>{t('resume.mine.new')}</DialogTitle>
        </DialogHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-8 px-6 py-6">
            <section className="flex flex-col gap-4">
              <RuleHeading>{t('resume.create.blankHeading')}</RuleHeading>
              <button
                type="button"
                onClick={() => onCreate(null)}
                className="hover:border-primary/60 flex cursor-pointer items-center gap-6 rounded-xl border p-4 text-left transition-colors"
              >
                <span className="bg-muted flex size-24 shrink-0 items-center justify-center rounded-lg">
                  <FilePlus2 className="text-muted-foreground size-8" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-medium">{t('resume.mine.newBlank')}</span>
                  <span className="text-muted-foreground mt-1 block text-sm">
                    {t('resume.create.blankDescription')}
                  </span>
                </span>
                <span className="text-primary hidden shrink-0 items-center gap-1 text-sm font-medium sm:flex">
                  {t('resume.create.now')}
                  <ChevronRight className="size-4" />
                </span>
              </button>
            </section>

            <section className="flex flex-col gap-4">
              <RuleHeading>{t('resume.create.templateHeading')}</RuleHeading>
              <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {TEMPLATE_CONFIGS.map((template) => {
                  const name = t(`resume.templates.list.${template.id}.name`)

                  return (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => onCreate(template.id)}
                      className="group flex cursor-pointer flex-col"
                    >
                      <span className="group-hover:border-primary/60 relative aspect-[210/297] overflow-hidden rounded-xl border bg-white shadow-sm transition-all group-hover:shadow-lg">
                        <img
                          src={templateSnapshotPath(template.layout)}
                          alt={name}
                          loading="lazy"
                          className="h-full w-full object-cover object-top"
                        />
                      </span>
                      <span className="group-hover:text-primary mt-3 text-center text-sm font-medium">
                        {name}
                      </span>
                    </button>
                  )
                })}
              </div>
            </section>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
