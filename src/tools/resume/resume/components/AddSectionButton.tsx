import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

import { DEFAULT_SECTION_ICONS } from '../constants'
import { nextCustomSectionId } from '../resume.service'
import { useResumeStore } from '../store'
import { STANDARD_MODULE_IDS } from '../types'
import { getTemplateForResume } from '../templates/registry'
import { SectionIcon } from './SectionIcon'

/**
 * 「添加章节」：模板的 availableSections 决定能加哪些标准章节，已存在的不再列出以免重复 id。
 *
 * 左栏与 dock 的章节浮层共用，两处文案与禁用口径必须一致。
 */
export function AddSectionButton({ className }: { className?: string }) {
  const { t } = useTranslation('tools-resume')
  const resume = useResumeStore((state) => state.activeResume)
  const setActiveSection = useResumeStore((state) => state.setActiveSection)
  const updateMenuSections = useResumeStore((state) => state.updateMenuSections)
  const createCustomSection = useResumeStore((state) => state.createCustomSection)
  const [open, setOpen] = useState(false)

  const menuSections = resume?.menuSections ?? []
  const template = getTemplateForResume(resume?.templateId)
  const allowed = template.availableSections ?? [...STANDARD_MODULE_IDS]
  const existingIds = new Set(menuSections.map((section) => section.id))
  const addableModules = STANDARD_MODULE_IDS.filter(
    (id) => allowed.includes(id) && !existingIds.has(id),
  )

  if (!resume) {
    return null
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn('w-full gap-1.5 border-dashed', className)}
        >
          <Plus className="size-4" />
          {t('resume.sidePanel.layout.addSection')}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-[var(--radix-popover-trigger-width)] p-1">
        <div className="flex flex-col gap-1">
          {addableModules.length > 0 &&
            addableModules.map((id) => (
              <button
                key={id}
                type="button"
                className="hover:bg-accent flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm"
                onClick={() => {
                  updateMenuSections([
                    ...menuSections,
                    {
                      id,
                      title: t(`resume.sidePanel.layout.standardSections.${id}`),
                      icon: DEFAULT_SECTION_ICONS[id] ?? '',
                      enabled: true,
                      order: menuSections.length,
                    },
                  ])
                  setActiveSection(id)
                  setOpen(false)
                }}
              >
                <SectionIcon name={DEFAULT_SECTION_ICONS[id] ?? ''} className="size-4" />
                {t(`resume.sidePanel.layout.standardSections.${id}`)}
              </button>
            ))}

          {addableModules.length > 0 && <Separator className="my-1" />}

          <button
            type="button"
            className="text-muted-foreground hover:bg-accent flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm italic"
            onClick={() => {
              createCustomSection({
                id: nextCustomSectionId(menuSections),
                title: t('resume.sidePanel.layout.customSectionTitle'),
                icon: 'Plus',
                enabled: true,
                order: menuSections.length,
              })
              setOpen(false)
            }}
          >
            <Plus className="size-4" />
            {t('resume.sidePanel.layout.addCustomSectionOption')}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
