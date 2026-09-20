import { FolderOpen, RefreshCw, ShieldCheck, ShieldAlert, Unlink } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

import {
  getSyncDirectoryHandle,
  isFileSystemAccessSupported,
  pickSyncDirectory,
  readSyncDirectoryPath,
} from '../file-sync'
import { useResumeStore } from '../store'

/**
 * 本地文件夹同步的入口徽标 + 设置对话框。
 *
 * 徽标显示最近一次落盘时间；未授权目录时显示"未备份"，
 * 这一路完全不经过服务器，文件由浏览器直接写到用户选的目录。
 */
export function BackupBadge({ className }: { className?: string }) {
  const { t, i18n } = useTranslation('tools-resume')
  const lastSyncedAt = useResumeStore((state) => state.lastSyncedAt)
  const syncPending = useResumeStore((state) => state.syncPending)
  const [open, setOpen] = useState(false)

  const label = syncPending
    ? t('resume.sync.pending')
    : lastSyncedAt
      ? t('resume.sync.backedUp', {
          time: new Date(lastSyncedAt).toLocaleTimeString(i18n.language),
        })
      : t('resume.sync.none')

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn('gap-1.5 text-xs', className)}
        onClick={() => setOpen(true)}
        title={t('resume.sync.title')}
      >
        {lastSyncedAt && !syncPending ? (
          <ShieldCheck className="text-primary size-4" />
        ) : (
          <ShieldAlert
            className={cn('size-4', syncPending && 'animate-spin motion-reduce:animate-none')}
          />
        )}
        {label}
      </Button>
      <SyncSettingsDialog open={open} onOpenChange={setOpen} />
    </>
  )
}

export function SyncSettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation('tools-resume')
  const syncAllResumes = useResumeStore((state) => state.syncAllResumes)
  const importFromDirectory = useResumeStore((state) => state.importFromDirectory)
  const forgetSyncDirectory = useResumeStore((state) => state.forgetSyncDirectory)
  const resumeCount = useResumeStore((state) => Object.keys(state.resumes).length)
  const [directoryName, setDirectoryName] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const supported = isFileSystemAccessSupported()

  const refresh = async () => {
    const handle = await getSyncDirectoryHandle()
    setDirectoryName(handle ? ((await readSyncDirectoryPath()) ?? handle.name) : null)
  }

  const choose = async () => {
    setBusy(true)
    try {
      const handle = await pickSyncDirectory()
      if (!handle) {
        toast.error(t('resume.sync.denied'))
        return
      }
      setDirectoryName(handle.name)
      toast.success(t('resume.sync.picked', { name: handle.name }))
    } catch {
      toast.error(t('resume.sync.denied'))
    } finally {
      setBusy(false)
    }
  }

  const push = async () => {
    setBusy(true)
    try {
      const synced = await syncAllResumes()
      toast.success(t('resume.sync.pushed', { n: synced }))
    } finally {
      setBusy(false)
    }
  }

  const pull = async () => {
    setBusy(true)
    try {
      const { imported, skipped } = await importFromDirectory()
      toast.success(t('resume.sync.pulled', { imported, skipped }))
    } finally {
      setBusy(false)
    }
  }

  const forget = async () => {
    await forgetSyncDirectory()
    setDirectoryName(null)
    toast.success(t('resume.sync.forgotten'))
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          void refresh()
        }
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('resume.sync.title')}</DialogTitle>
          <DialogDescription>{t('resume.sync.description')}</DialogDescription>
        </DialogHeader>

        {!supported ? (
          <p className="text-muted-foreground rounded-md border border-dashed px-3 py-4 text-sm">
            {t('resume.sync.unsupported')}
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="border-border bg-muted/30 flex items-center gap-2 rounded-lg border px-3 py-2">
              <FolderOpen className="text-muted-foreground size-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-sm">
                {directoryName ?? t('resume.sync.noDirectory')}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void choose()}
              >
                {directoryName ? t('resume.sync.change') : t('resume.sync.choose')}
              </Button>
            </div>

            <p className="text-muted-foreground text-xs">{t('resume.sync.autosaveHint')}</p>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy || !directoryName}
                onClick={() => void push()}
                className="gap-1.5"
              >
                <RefreshCw className="size-4" />
                {t('resume.sync.push', { n: resumeCount })}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy || !directoryName}
                onClick={() => void pull()}
              >
                {t('resume.sync.pull')}
              </Button>
            </div>

            {directoryName && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-muted-foreground gap-1.5 self-start text-xs"
                onClick={() => void forget()}
              >
                <Unlink className="size-4" />
                {t('resume.sync.forget')}
              </Button>
            )}
          </div>
        )}

        <DialogFooter>
          <p className="text-muted-foreground text-left text-xs">{t('resume.sync.footnote')}</p>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
