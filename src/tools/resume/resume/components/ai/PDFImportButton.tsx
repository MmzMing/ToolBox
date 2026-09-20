import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { FileUp, Loader2 } from 'lucide-react'
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

import { RESUME_IMPORT_PROMPT } from '../../../ai/prompts'
import { requestAIText, parseJsonPayload } from '../../../ai/transport'
import { assertPdfImportable, buildResumeFromAI } from '../../../ai/pdf-import'
import { toAIConnection } from '../../../ai/providers'
import { useResumeStore } from '../../store'
import { useAIDialogStore, useAIEnabled, useTaskModel } from './useAIGate'
import { aiErrorKey } from './error-copy'
import type { ResumeLocale } from '../../store'

type ParsedResume = {
  title?: string
  basic?: Record<string, unknown>
  education?: unknown[]
  experience?: unknown[]
  projects?: unknown[]
  skills?: unknown[]
}

const str = (value: unknown) => (typeof value === 'string' ? value : '')

/**
 * PDF 视觉导入。
 *
 * pdf.js 只在真的用到时才拉，所以渲染函数用动态 import —— 它连同 worker 是本页最重的一块。
 * 按钮常驻，但总开关没开时置灰不可点：PDF 导入完全依赖视觉模型，藏着不如摆着说明白。
 */
export function PDFImportButton() {
  const { t, i18n } = useTranslation('tools-resume')
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const enabled = useAIEnabled()
  const pdfModel = useTaskModel('pdf')
  const setConfigOpen = useAIDialogStore((state) => state.setConfigOpen)

  const [busy, setBusy] = useState(false)
  const [parsed, setParsed] = useState<ParsedResume | null>(null)
  const [fileName, setFileName] = useState('')

  const handleFile = async (file: File) => {
    if (!pdfModel) {
      toast.error(t('resume.ai.pdf.needVisionModel'))
      setConfigOpen(true)
      return
    }
    setBusy(true)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const { renderPdfToImages } = await import('../../../ai/pdf-render')
      const pages = await renderPdfToImages(file, controller.signal)
      const requestBytes = pages.reduce((total, page) => total + page.bytes, 0)
      assertPdfImportable({ fileBytes: file.size, pages: pages.length, requestBytes })

      const content = await requestAIText(
        toAIConnection(pdfModel),
        {
          system: RESUME_IMPORT_PROMPT,
          text: RESUME_IMPORT_PROMPT,
          images: pages.map((page) => page.dataUrl),
          json: true,
        },
        controller.signal,
      )
      setParsed(parseJsonPayload(content) as ParsedResume)
      setFileName(file.name.replace(/\.pdf$/i, ''))
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return
      }
      toast.error(t(aiErrorKey(error)))
    } finally {
      setBusy(false)
      abortRef.current = null
    }
  }

  const confirm = () => {
    if (!parsed) {
      return
    }
    const locale: ResumeLocale = i18n.language.startsWith('en') ? 'en' : 'zh'
    const id = useResumeStore.getState().createResume(null, { blank: true, locale })
    const shell = useResumeStore.getState().resumes[id]
    if (!shell) {
      return
    }
    const { resume, warnings } = buildResumeFromAI(shell, parsed, {
      id,
      fileName,
      templateId: shell.templateId,
      now: new Date().toISOString(),
    })
    useResumeStore.getState().addResume(resume)
    warnings.forEach((warning) => toast.warning(t(`resume.ai.pdf.warnings.${warning}`)))
    setParsed(null)
    navigate(`/resume/${id}`)
  }

  const basic = (parsed?.basic ?? {}) as Record<string, unknown>

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) {
            void handleFile(file)
          }
          event.target.value = ''
        }}
      />
      <Button
        variant="outline"
        size="sm"
        disabled={!enabled || busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <FileUp className="size-4" />}
        {t('resume.ai.pdf.entry')}
      </Button>

      <Dialog open={!!parsed} onOpenChange={(next) => !next && setParsed(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('resume.ai.pdf.previewTitle')}</DialogTitle>
            <DialogDescription>{t('resume.ai.pdf.previewHint')}</DialogDescription>
          </DialogHeader>
          <dl className="text-sm">
            {[
              [t('resume.ai.pdf.field.name'), str(basic.name)],
              [t('resume.ai.pdf.field.title'), str(basic.title)],
              [t('resume.ai.pdf.field.email'), str(basic.email)],
              [
                t('resume.ai.pdf.counts'),
                t('resume.ai.pdf.countsValue', {
                  education: parsed?.education?.length ?? 0,
                  experience: parsed?.experience?.length ?? 0,
                  projects: parsed?.projects?.length ?? 0,
                }),
              ],
            ].map(([label, value]) => (
              <div key={label} className="flex gap-2 border-b py-1.5 last:border-b-0">
                <dt className="text-muted-foreground w-24 shrink-0">{label}</dt>
                <dd className="min-w-0 flex-1 truncate">{value}</dd>
              </div>
            ))}
          </dl>
          <DialogFooter>
            <Button variant="outline" onClick={() => setParsed(null)}>
              {t('resume.confirm.cancel')}
            </Button>
            <Button onClick={confirm}>{t('resume.ai.pdf.confirm')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
