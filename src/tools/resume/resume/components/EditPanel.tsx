import { Eye, EyeOff, Plus, Trash2 } from 'lucide-react'
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
import { Card, CardAction, CardContent, CardHeader } from '@/components/ui/card'
import { useResumeStore } from '../store'
import { addSectionItem, isItemListSection, removeSection } from '../section-actions'
import type { RailMode } from '../editor-ui'
import { SectionHeader } from './SectionHeader'
import { StylePage } from './StylePage'
import { TemplatePicker } from './TemplatePicker'
import { BasicPanel } from './basic/BasicPanel'
import { CertificatesPanel } from './certificates/CertificatesPanel'
import { ExperiencePanel } from './experience/ExperiencePanel'
import {
  CustomSectionPanel,
  EducationPanel,
  ProjectPanel,
  RichContentPanel,
} from './panels/sections'

/** 中栏：操作栏第一层决定这里铺内容表单、样式全集还是模板九宫格 */
export function EditPanel({ mode = 'content' }: { mode?: RailMode }) {
  const { t } = useTranslation('tools-resume')
  const resume = useResumeStore((state) => state.activeResume)
  const toggleSectionVisibility = useResumeStore((state) => state.toggleSectionVisibility)

  if (!resume) {
    return null
  }

  const { activeSection } = resume
  const section = resume.menuSections.find((item) => item.id === activeSection)
  /** 基本信息钉在首位：既不能改名也不能删除，条目型章节才有「添加一条」 */
  const locked = activeSection === 'basic'
  const hidden = section?.enabled === false

  const sectionForm = (() => {
    switch (activeSection) {
      case 'skills':
        return <RichContentPanel field="skillContent" placeholderKey="resume.skills.placeholder" />
      case 'selfEvaluation':
        return (
          <RichContentPanel
            field="selfEvaluationContent"
            placeholderKey="resume.selfEvaluation.placeholder"
          />
        )
      case 'experience':
        return <ExperiencePanel />
      case 'education':
        return <EducationPanel />
      case 'projects':
        return <ProjectPanel />
      case 'basic':
        return <BasicPanel />
      case 'certificates':
        return <CertificatesPanel />
      default:
        return activeSection.startsWith('custom') ? (
          <CustomSectionPanel sectionId={activeSection} />
        ) : (
          <p className="text-muted-foreground text-sm">{t('resume.editor.unknownSection')}</p>
        )
    }
  })()

  const body =
    mode === 'style' ? <StylePage /> : mode === 'template' ? <TemplatePicker /> : sectionForm

  return (
    <div className="h-full overflow-y-auto p-4">
      <Card className="gap-0 py-0">
        <CardHeader className="py-3">
          {mode === 'content' ? (
            <SectionHeader sectionId={activeSection} title={section?.title ?? ''} locked={locked} />
          ) : (
            <h3 className="truncate text-sm font-medium">
              {mode === 'style' ? t('resume.rail.style') : t('resume.rail.template')}
            </h3>
          )}

          {mode === 'content' && (
            <CardAction className="flex items-center gap-1 self-center">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="shrink-0"
                aria-label={hidden ? t('resume.layout.show') : t('resume.layout.hide')}
                title={hidden ? t('resume.layout.show') : t('resume.layout.hide')}
                aria-pressed={!hidden}
                onClick={() => toggleSectionVisibility(activeSection)}
              >
                {hidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </Button>

              {isItemListSection(activeSection) && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 gap-1.5"
                  onClick={() => addSectionItem(activeSection)}
                >
                  <Plus className="size-4" />
                  {t('resume.section.addItem')}
                </Button>
              )}

              {!locked && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="shrink-0"
                      title={t('resume.layout.delete')}
                      aria-label={t('resume.layout.delete')}
                    >
                      <Trash2 className="text-destructive size-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        {t('resume.layout.deleteTitle', { title: section?.title ?? '' })}
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        {t('resume.layout.deleteDescription')}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t('resume.confirm.cancel')}</AlertDialogCancel>
                      <AlertDialogAction
                        variant="destructive"
                        onClick={() => removeSection(activeSection)}
                      >
                        {t('resume.confirm.confirm')}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </CardAction>
          )}
        </CardHeader>
        <CardContent className="border-border border-t p-4">{body}</CardContent>
      </Card>
    </div>
  )
}
