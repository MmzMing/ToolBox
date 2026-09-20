import { FolderSync, Plus, Upload } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { CreateResumeDialog } from './components/CreateResumeDialog'
import { ResumeCard } from './components/ResumeCard'
import { SyncSettingsDialog } from './components/BackupBadge'
import { useResumeStore } from './store'
import type { ResumeLocale } from './store'
import { migrateLegacyResumes } from './legacy-import'
import { parseResumeJson, reissueResume } from './resume.service'
import type { ResumeData } from './types'

function currentLocale(language: string): ResumeLocale {
  return language.startsWith('en') ? 'en' : 'zh'
}

/** 入口页：我的简历网格，首格固定是新建卡片 */
export default function Resume() {
  const { t, i18n } = useTranslation('tools-resume')
  const navigate = useNavigate()
  const resumes = useResumeStore((state) => state.resumes)
  const createResume = useResumeStore((state) => state.createResume)
  const duplicateResume = useResumeStore((state) => state.duplicateResume)
  const deleteResume = useResumeStore((state) => state.deleteResume)
  const updateResume = useResumeStore((state) => state.updateResume)
  const addResume = useResumeStore((state) => state.addResume)
  const [pendingDelete, setPendingDelete] = useState<ResumeData | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [syncOpen, setSyncOpen] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  // 旧项目把数据存在同一个 origin 的 'resume-storage' 下，进页面搬一次即可
  useEffect(() => {
    const result = migrateLegacyResumes()
    if (result.imported > 0) {
      toast.info(t('resume.mine.legacyImported', { n: result.imported }))
    }
  }, [t])

  const sorted = useMemo(
    () => Object.values(resumes).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [resumes],
  )

  /** null = 空白简历（不带示例内容）；给了模板 id 则用该模板的示例简历起步 */
  const createAndOpen = (templateId: string | null) => {
    setCreateOpen(false)
    const id = createResume(templateId, {
      blank: templateId === null,
      locale: currentLocale(i18n.language),
    })
    navigate(`/resume/${id}`)
  }

  const handleImport = async (file: File) => {
    try {
      const resume = reissueResume(parseResumeJson(await file.text()))
      addResume(resume)
      toast.success(t('resume.mine.importOk', { title: resume.title }))
    } catch {
      toast.error(t('resume.mine.importFailed'))
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h2 className="text-base font-medium">{t('resume.mine.heading')}</h2>
          {sorted.length > 0 && (
            <span className="text-muted-foreground text-sm">
              {t('resume.mine.count', { n: sorted.length })}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) {
                void handleImport(file)
              }
              event.target.value = ''
            }}
          />
          <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
            <Upload className="size-4" />
            {t('resume.mine.import')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setSyncOpen(true)}>
            <FolderSync className="size-4" />
            {t('resume.sync.title')}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-3 xl:grid-cols-4">
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="bg-card hover:border-primary/60 flex aspect-[210/297] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-4 text-center transition-colors"
        >
          <span className="bg-muted flex size-16 items-center justify-center rounded-full">
            <Plus className="size-8" />
          </span>
          <span className="text-base font-medium">{t('resume.mine.new')}</span>
          <span className="text-muted-foreground text-sm">{t('resume.mine.newDescription')}</span>
        </button>

        {sorted.map((resume) => (
          <ResumeCard
            key={resume.id}
            resume={resume}
            onOpen={() => navigate(`/resume/${resume.id}`)}
            onRename={(title) => updateResume(resume.id, { title })}
            onDuplicate={() => {
              const id = duplicateResume(resume.id, currentLocale(i18n.language))
              const copy = useResumeStore.getState().resumes[id]
              if (copy) {
                toast.success(t('resume.mine.duplicated', { title: copy.title }))
              }
            }}
            onDelete={() => setPendingDelete(resume)}
          />
        ))}
      </div>

      <CreateResumeDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={createAndOpen} />

      <SyncSettingsDialog open={syncOpen} onOpenChange={setSyncOpen} />

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('resume.confirm.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('resume.confirm.deleteDescription', { title: pendingDelete?.title ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('resume.confirm.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDelete) {
                  toast.success(t('resume.mine.deleted', { title: pendingDelete.title }))
                  deleteResume(pendingDelete)
                  if (window.location.pathname.startsWith('/resume/')) {
                    navigate('/resume')
                  }
                }
                setPendingDelete(null)
              }}
            >
              {t('resume.confirm.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
