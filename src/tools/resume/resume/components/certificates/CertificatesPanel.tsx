import { ImagePlus, Trash2 } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { v4 as uuidv4 } from 'uuid'

import { Button } from '@/components/ui/button'
import { NumberField } from '../NumberField'
import {
  CERTIFICATE_COMPRESSION_LADDER,
  CERTIFICATE_MAX_BASE64_BYTES,
  CERTIFICATE_WIDTH_RANGE,
} from '../../constants'
import { compressToLimit } from '../../image-utils'
import { useResumeStore } from '../../store'

/** 证书附图：多图上传 / 粘贴、逐张宽度、删除 */
export function CertificatesPanel() {
  const { t } = useTranslation('tools-resume')
  const resume = useResumeStore((state) => state.activeResume)
  const addCertificate = useResumeStore((state) => state.addCertificate)
  const updateCertificate = useResumeStore((state) => state.updateCertificate)
  const removeCertificate = useResumeStore((state) => state.removeCertificate)
  const fileInput = useRef<HTMLInputElement>(null)

  const activeSection = resume?.activeSection
  const certificates = resume?.certificates ?? []

  const importFiles = async (files: File[]) => {
    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        continue
      }
      try {
        const url = await compressToLimit(
          file,
          CERTIFICATE_COMPRESSION_LADDER,
          CERTIFICATE_MAX_BASE64_BYTES,
        )
        addCertificate({ id: uuidv4(), url, width: 100 })
      } catch {
        toast.error(t('resume.certificates.compressFailed'))
      }
    }
  }

  // 停在证书章节时，剪贴板里的图直接入库
  useEffect(() => {
    if (activeSection !== 'certificates') {
      return
    }

    const onPaste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.files ?? [])
      if (files.length > 0) {
        void importFiles(files)
      }
    }

    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection])

  if (!resume) {
    return null
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => {
          void importFiles(Array.from(event.target.files ?? []))
          event.target.value = ''
        }}
      />

      {certificates.length === 0 ? (
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="border-border text-muted-foreground hover:border-primary/50 hover:text-foreground flex flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-10 text-sm transition-colors"
        >
          <ImagePlus className="size-6" />
          {t('resume.certificates.empty')}
        </button>
      ) : (
        <div className="flex flex-col gap-3">
          {certificates.map((certificate, index) => (
            <div
              key={certificate.id}
              className="border-border bg-card flex items-center gap-3 rounded-xl border p-3"
            >
              <img
                src={certificate.url}
                alt={t('resume.certificates.item', { index: index + 1 })}
                className="bg-muted size-16 shrink-0 rounded object-contain"
              />
              <div className="min-w-0 flex-1">
                <NumberField
                  label={t('resume.certificates.width')}
                  value={certificate.width}
                  min={CERTIFICATE_WIDTH_RANGE.min}
                  max={CERTIFICATE_WIDTH_RANGE.max}
                  step={CERTIFICATE_WIDTH_RANGE.step}
                  unit="%"
                  onValueChange={(width) => updateCertificate(certificate.id, { width })}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="shrink-0"
                aria-label={t('resume.certificates.remove')}
                onClick={() => removeCertificate(certificate.id)}
              >
                <Trash2 className="text-destructive size-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5 border-dashed"
        onClick={() => fileInput.current?.click()}
      >
        <ImagePlus className="size-4" />
        {t('resume.certificates.add')}
      </Button>
    </div>
  )
}
