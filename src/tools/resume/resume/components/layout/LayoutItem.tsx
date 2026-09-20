import { Reorder, useDragControls } from 'motion/react'
import { Eye, EyeOff, GripVertical, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useResumeStore } from '../../store'
import { SectionIcon } from '../SectionIcon'
import type { MenuSection } from '../../types'

type LayoutItemProps = {
  item: MenuSection
  activeSection: string
  /** 基本信息章节钉在首位：不可拖动、不可删除 */
  pinned?: boolean
  /** 选中章节后的附加动作：dock 浮层用它收起自己 */
  onSectionSelect?: (sectionId: string) => void
}

export function LayoutItem({
  item,
  activeSection,
  pinned = false,
  onSectionSelect,
}: LayoutItemProps) {
  const { t } = useTranslation('tools-resume')
  const dragControls = useDragControls()
  const setActiveSection = useResumeStore((state) => state.setActiveSection)
  const toggleSectionVisibility = useResumeStore((state) => state.toggleSectionVisibility)
  const updateMenuSections = useResumeStore((state) => state.updateMenuSections)
  const removeCustomData = useResumeStore((state) => state.removeCustomData)

  const active = activeSection === item.id
  const select = () => {
    setActiveSection(item.id)
    onSectionSelect?.(item.id)
  }
  const rowClass = cn(
    'group border-border bg-card flex rounded-lg border',
    'hover:border-primary/50 transition-colors',
    active && 'border-primary text-primary ring-1 ring-primary',
  )

  const removeSection = () => {
    const current = useResumeStore.getState().activeResume
    if (!current) {
      return
    }

    const index = current.menuSections.findIndex((section) => section.id === item.id)
    const remaining = current.menuSections.filter((section) => section.id !== item.id)
    // 删掉正在编辑的章节时把焦点落到前一章节，别停在一个已不存在的 id 上
    const fallback = current.menuSections[index - 1] ?? remaining[0]

    updateMenuSections(remaining)
    if (item.id.startsWith('custom')) {
      removeCustomData(item.id)
    }
    if (fallback) {
      setActiveSection(fallback.id)
    }
  }

  const label = (
    <>
      <SectionIcon
        name={item.icon}
        className="text-muted-foreground group-hover:text-foreground size-4 shrink-0"
      />
      <span className="min-w-0 flex-1 truncate text-sm">{item.title}</span>
    </>
  )

  if (pinned) {
    return (
      <div
        className={cn(rowClass, 'mb-2 cursor-pointer items-center gap-3 p-3 pl-5')}
        onClick={select}
      >
        {label}
      </div>
    )
  }

  return (
    <Reorder.Item
      id={item.id}
      value={item}
      dragListener={false}
      dragControls={dragControls}
      whileDrag={{ scale: 1.02 }}
      className={cn(rowClass, 'overflow-hidden')}
    >
      <div
        aria-label={t('resume.layout.drag')}
        onPointerDown={(event) => dragControls.start(event)}
        className="border-border hover:bg-muted/50 flex w-8 shrink-0 cursor-grab touch-none items-center justify-center border-r"
      >
        <GripVertical className="text-muted-foreground size-4" />
      </div>

      <div
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 p-3 select-none"
        onClick={select}
      >
        {label}

        <Button
          variant="ghost"
          size="icon-sm"
          className="shrink-0"
          title={item.enabled ? t('resume.layout.hide') : t('resume.layout.show')}
          aria-label={item.enabled ? t('resume.layout.hide') : t('resume.layout.show')}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation()
            toggleSectionVisibility(item.id)
          }}
        >
          {item.enabled ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
        </Button>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="shrink-0"
              title={t('resume.layout.delete')}
              aria-label={t('resume.layout.delete')}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
            >
              <Trash2 className="text-destructive size-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent onClick={(event) => event.stopPropagation()}>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t('resume.layout.deleteTitle', { title: item.title })}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t('resume.layout.deleteDescription')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={(event) => event.stopPropagation()}>
                {t('resume.confirm.cancel')}
              </AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={(event) => {
                  event.stopPropagation()
                  removeSection()
                }}
              >
                {t('resume.confirm.confirm')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Reorder.Item>
  )
}
