import { AlertTriangle, Check, FileUp, Info, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { analysePdf, type PdfAnalysis } from './pdf-signature-checker.service'

function ResultRow({ label, passed, value }: { label: string; passed?: boolean; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <span className="text-muted-foreground flex items-center gap-2 text-sm">
        {passed !== undefined &&
          (passed ? (
            <Check className="text-primary size-4 shrink-0" />
          ) : (
            <X className="text-destructive size-4 shrink-0" />
          ))}
        {label}
      </span>
      <span className="text-right font-mono text-sm break-all">{value}</span>
    </div>
  )
}

export default function PdfSignatureChecker() {
  const { t } = useTranslation('tools-crypto')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState('')
  const [analysis, setAnalysis] = useState<PdfAnalysis | null>(null)
  const [hasError, setHasError] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  const handleFile = async (file: File) => {
    setFileName(file.name)
    setAnalysis(null)
    setHasError(false)
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      setAnalysis(analysePdf(bytes))
    } catch {
      setHasError(true)
    }
  }

  const handlePickFile = () => {
    fileInputRef.current?.click()
  }

  return (
    <div className="flex flex-col gap-4">
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) {
            void handleFile(file)
          }
          event.target.value = ''
        }}
      />

      <div
        role="button"
        tabIndex={0}
        className={`flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-6 text-center transition-colors ${
          isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/40'
        }`}
        onDragOver={(event) => {
          event.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setIsDragging(false)
          const file = event.dataTransfer.files?.[0]
          if (file) {
            void handleFile(file)
          }
        }}
        onClick={handlePickFile}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            handlePickFile()
          }
        }}
      >
        <FileUp className="text-muted-foreground size-8" />
        <p className="text-sm">{t('pdf-signature-checker.dropHint')}</p>
        <Button type="button" variant="outline" size="sm" onClick={handlePickFile}>
          {t('pdf-signature-checker.pickFile')}
        </Button>
      </div>

      {hasError && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertDescription>{t('pdf-signature-checker.notPdf')}</AlertDescription>
        </Alert>
      )}

      {analysis !== null && (
        <div className="flex flex-col gap-2">
          <Label>{fileName}</Label>
          <div className="divide-y rounded-lg border px-3">
            <ResultRow
              label={t('pdf-signature-checker.hasAcroForm')}
              passed={analysis.hasAcroForm}
              value={t(
                analysis.hasAcroForm ? 'pdf-signature-checker.yes' : 'pdf-signature-checker.no',
              )}
            />
            <ResultRow
              label={t('pdf-signature-checker.hasSignatureField')}
              passed={analysis.hasSignatureField}
              value={t(
                analysis.hasSignatureField
                  ? 'pdf-signature-checker.yes'
                  : 'pdf-signature-checker.no',
              )}
            />
            <ResultRow
              label={t('pdf-signature-checker.signatureCount')}
              value={String(analysis.signatureCount)}
            />
            <ResultRow
              label={t('pdf-signature-checker.byteRanges')}
              value={
                analysis.byteRanges.length === 0
                  ? '-'
                  : analysis.byteRanges.map((range) => `[${range.join(', ')}]`).join('\n')
              }
            />
          </div>

          {analysis.warnings.length > 0 && (
            <div className="flex flex-col gap-2">
              {analysis.warnings.map((warning) => (
                <Alert key={warning} variant="destructive">
                  <AlertTriangle />
                  <AlertDescription>
                    {t(`pdf-signature-checker.warning.${warning}`)}
                  </AlertDescription>
                </Alert>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="text-muted-foreground flex items-start gap-1.5 text-xs">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        <span>{t('pdf-signature-checker.disclaimer')}</span>
      </div>
    </div>
  )
}
