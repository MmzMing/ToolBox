import { FileImage, Trash2 } from 'lucide-react'
import { useState, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { SpanCopyable } from '@/components/copyable/span-copyable'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { base64ToFile, fileToBase64, formatFileSize, guessFileName, parseDataUrl } from './service'

interface FileEntry {
  id: string
  name: string
  size: number
  dataUrl: string
}

/** 大 Data URL 截断展示，复制仍走完整值 */
function truncateForDisplay(value: string, max = 160): string {
  return value.length > max ? `${value.slice(0, max)}…` : value
}

export default function Base64FileConverter() {
  const { t } = useTranslation('tools-converter')
  const { t: tCommon } = useTranslation('common')

  const [files, setFiles] = useState<FileEntry[]>([])
  const [isDragActive, setIsDragActive] = useState(false)
  const [encodeError, setEncodeError] = useState<string | null>(null)
  const [dataUrlInput, setDataUrlInput] = useState('')
  const [reverseName, setReverseName] = useState('')
  const [reverseInfo, setReverseInfo] = useState<{ mime: string; bytes: number } | null>(null)
  const [reverseError, setReverseError] = useState<string | null>(null)

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) {
      return
    }
    try {
      const entries = await Promise.all(
        Array.from(fileList).map(async (file) => ({
          id: crypto.randomUUID(),
          name: file.name,
          size: file.size,
          dataUrl: await fileToBase64(file),
        })),
      )
      setFiles((previous) => [...previous, ...entries])
      setEncodeError(null)
    } catch {
      setEncodeError(tCommon('error'))
    }
  }

  const handleDragOver = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault()
    setIsDragActive(true)
  }

  const handleDragLeave = () => setIsDragActive(false)

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault()
    setIsDragActive(false)
    void handleFiles(event.dataTransfer.files)
  }

  const handleDataUrlChange = (value: string) => {
    setDataUrlInput(value)
    if (value.trim() === '') {
      setReverseName('')
      setReverseInfo(null)
      setReverseError(null)
      return
    }
    try {
      setReverseName(guessFileName(value))
      const parts = parseDataUrl(value)
      setReverseInfo({ mime: parts.mime, bytes: parts.bytes.length })
      setReverseError(null)
    } catch {
      setReverseInfo(null)
      setReverseError(tCommon('error'))
    }
  }

  const handleDownload = () => {
    if (!reverseInfo) {
      return
    }
    try {
      const file = base64ToFile(dataUrlInput, reverseName)
      const url = URL.createObjectURL(file)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = file.name
      anchor.click()
      URL.revokeObjectURL(url)
      setReverseError(null)
    } catch {
      setReverseError(tCommon('error'))
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label>{t('base64-file-converter.encodeLabel')}</Label>
        <label
          className={cn(
            'text-muted-foreground hover:bg-accent flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed p-6 text-sm transition-colors',
            isDragActive && 'border-primary bg-accent',
          )}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <FileImage className="size-6" />
          <span>{t('base64-file-converter.dropHint')}</span>
          <input
            type="file"
            multiple
            className="sr-only"
            onChange={(event) => {
              void handleFiles(event.target.files)
              event.target.value = ''
            }}
          />
        </label>

        {encodeError && (
          <Alert variant="destructive">
            <AlertDescription>{encodeError}</AlertDescription>
          </Alert>
        )}

        {files.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{t('base64-file-converter.filesLabel')}</span>
              <Button type="button" variant="ghost" size="sm" onClick={() => setFiles([])}>
                <Trash2 />
                {tCommon('clear')}
              </Button>
            </div>
            {files.map((file) => (
              <div key={file.id} className="flex flex-col gap-1 rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <FileImage className="text-muted-foreground size-4 shrink-0" />
                  <span className="truncate text-sm font-medium">{file.name}</span>
                  <span className="text-muted-foreground ml-auto shrink-0 text-xs">
                    {formatFileSize(file.size)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className="text-muted-foreground min-w-0 flex-1 truncate font-mono text-xs"
                    title={file.dataUrl}
                  >
                    {truncateForDisplay(file.dataUrl)}
                  </span>
                  <SpanCopyable value={file.dataUrl} showText={false} className="shrink-0" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label>{t('base64-file-converter.decodeLabel')}</Label>
        <Textarea
          value={dataUrlInput}
          onChange={(event) => handleDataUrlChange(event.target.value)}
          className="min-h-24 font-mono text-sm"
          placeholder={t('base64-file-converter.dataUrlInput')}
        />

        {reverseError && (
          <Alert variant="destructive">
            <AlertDescription>{reverseError}</AlertDescription>
          </Alert>
        )}

        {reverseInfo && (
          <div className="flex flex-col gap-2 rounded-lg border p-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">{t('base64-file-converter.fileType')}</span>
              <span className="font-mono">{reverseInfo.mime}</span>
              <span className="text-muted-foreground">{t('base64-file-converter.fileSize')}</span>
              <span className="font-mono">{formatFileSize(reverseInfo.bytes)}</span>
            </div>
            <div className="flex items-end gap-2">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <Label htmlFor="base64-file-name">{t('base64-file-converter.fileName')}</Label>
                <Input
                  id="base64-file-name"
                  value={reverseName}
                  onChange={(event) => setReverseName(event.target.value)}
                />
              </div>
              <Button type="button" onClick={handleDownload}>
                {t('base64-file-converter.download')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
