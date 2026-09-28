import { Download, FileJson, FileText, Image, Printer, ScrollText, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

import { DEFAULT_FONT_FAMILY } from '../constants'
import { downloadResumeJson } from '../export/json'
import { resumeToMarkdown } from '../export/markdown'
import {
  exportPaperToLongPageImage,
  exportPaperToLongPagePdf,
  exportPaperToPagedPdf,
} from '../export/pdf'
import { printPaper } from '../export/print'
import { downloadText } from '../export/download'
import { resumeFileName } from '../resume.service'
import { useResumeStore } from '../store'

type ExportKind = 'pagedPdf' | 'pdf' | 'image' | 'print' | 'json' | 'markdown'

const TILES: Array<{ kind: ExportKind; icon: typeof FileText; hintKey: string }> = [
  { kind: 'pagedPdf', icon: ScrollText, hintKey: 'resume.export.tiles.pagedPdfHint' },
  { kind: 'pdf', icon: FileText, hintKey: 'resume.export.tiles.pdfHint' },
  { kind: 'image', icon: Image, hintKey: 'resume.export.tiles.imageHint' },
  { kind: 'print', icon: Printer, hintKey: 'resume.export.tiles.printHint' },
  { kind: 'json', icon: FileJson, hintKey: 'resume.export.tiles.jsonHint' },
  { kind: 'markdown', icon: Sparkles, hintKey: 'resume.export.tiles.markdownHint' },
]

/** 导出对话框：五种通道，全部在浏览器本地完成 */
export function ExportDialog() {
  const { t } = useTranslation('tools-resume')
  const resume = useResumeStore((state) => state.activeResume)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<ExportKind | null>(null)

  if (!resume) {
    return null
  }

  const paperOptions = {
    pagePadding: resume.globalSettings.pagePadding ?? 0,
    fontFamily: resume.globalSettings.fontFamily || DEFAULT_FONT_FAMILY,
  }

  const run = async (kind: ExportKind) => {
    setBusy(kind)
    try {
      if (kind === 'pagedPdf') {
        await exportPaperToPagedPdf(resume.title, paperOptions)
      } else if (kind === 'pdf') {
        await exportPaperToLongPagePdf(resume.title, paperOptions)
      } else if (kind === 'image') {
        await exportPaperToLongPageImage(resume.title, paperOptions)
      } else if (kind === 'print') {
        await printPaper(resume.title, paperOptions.fontFamily)
        setOpen(false)
        return
      } else if (kind === 'json') {
        downloadResumeJson(resume)
      } else {
        downloadText(
          resumeToMarkdown(resume, t),
          `${resumeFileName(resume.title).replace(/\.json$/, '')}.md`,
          'text/markdown',
        )
      }
      toast.success(t('resume.export.done'))
    } catch (error) {
      console.error('[resume-export] failed', error)
      toast.error(t('resume.export.failed'))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="shrink-0 gap-1.5">
          <Download className="size-4" />
          {t('resume.export.tooltip')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('resume.export.title')}</DialogTitle>
          <DialogDescription>{t('resume.export.description')}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {TILES.map(({ kind, icon: Icon, hintKey }) => (
            <button
              key={kind}
              type="button"
              disabled={busy !== null}
              onClick={() => void run(kind)}
              className={cn(
                'border-border bg-card hover:border-primary/60 flex flex-col items-center gap-2 rounded-xl border p-4 text-center transition-colors',
                busy === kind && 'border-primary',
              )}
            >
              <Icon className="text-muted-foreground size-5" />
              <span className="text-sm font-medium">{t(`resume.export.tiles.${kind}`)}</span>
              <span className="text-muted-foreground text-xs">{t(hintKey)}</span>
            </button>
          ))}
        </div>

        <p className="text-muted-foreground text-xs">{t('resume.export.footnote')}</p>
      </DialogContent>
    </Dialog>
  )
}
