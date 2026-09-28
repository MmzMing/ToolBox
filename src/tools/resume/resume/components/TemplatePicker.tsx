import { Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

import { useResumeStore } from '../store'
import { TEMPLATE_CONFIGS, templateSnapshotPath } from '../templates/registry'

/** 模板选择：编辑区内的九宫格，点一下即切换（不再走抽屉） */
export function TemplatePicker() {
  const { t } = useTranslation('tools-resume')
  const templateId = useResumeStore((state) => state.activeResume?.templateId)
  const setTemplate = useResumeStore((state) => state.setTemplate)

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      {TEMPLATE_CONFIGS.map((template) => {
        const active = template.id === templateId
        const name = t(`resume.templates.list.${template.id}.name`)

        return (
          <button
            key={template.id}
            type="button"
            onClick={() => setTemplate(template.id)}
            aria-pressed={active}
            title={t(`resume.templates.list.${template.id}.description`)}
            className={cn(
              'group relative overflow-hidden rounded-lg border-2 text-left transition-all hover:scale-[1.02]',
              active ? 'border-primary shadow-lg' : 'border-border hover:border-primary/50',
            )}
          >
            <div className="bg-muted/40 relative aspect-[210/297] overflow-hidden">
              <img
                src={templateSnapshotPath(template.layout)}
                alt={name}
                draggable={false}
                className="h-full w-full object-cover object-top"
              />
              {active && (
                <span className="bg-primary/10 absolute inset-0 flex items-center justify-center">
                  <Check className="text-primary size-8" />
                </span>
              )}
            </div>
            <p className="truncate px-2 py-1.5 text-xs font-medium">{name}</p>
          </button>
        )
      })}
    </div>
  )
}
