import { ClipboardPaste, ImageUp } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { filesFromDataTransfer, imageFilesFromClipboard } from '@/utils/data-transfer-files'
import { useImageStackStore } from '../store'

/** 首屏上传区：点击 / 拖拽（含文件夹）/ 剪贴板粘贴，支持一次多选 */
export function UploadZone() {
  const { t } = useTranslation('tools-images', { keyPrefix: 'image-stack' })
  const addFiles = useImageStackStore((state) => state.addFiles)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const open = useCallback(() => inputRef.current?.click(), [])

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const files = imageFilesFromClipboard(event.clipboardData)
      if (files.length > 0) {
        void addFiles(files)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [addFiles])

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => {
          void addFiles(Array.from(event.target.files ?? []))
          event.target.value = ''
        }}
      />
      <div
        role="button"
        tabIndex={0}
        onClick={open}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            open()
          }
        }}
        onDragOver={(event) => {
          event.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragOver(false)
          void filesFromDataTransfer(event.dataTransfer).then((files) => {
            if (files.length > 0) {
              void addFiles(files)
            }
          })
        }}
        className={cn(
          'flex min-h-[420px] cursor-pointer flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed p-8 text-center transition-colors',
          dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50',
        )}
      >
        <span className="bg-primary/10 text-primary flex size-16 items-center justify-center rounded-2xl">
          <ImageUp className="size-8" />
        </span>
        <div className="flex flex-col gap-1">
          <p className="text-base font-semibold">{t('upload.dropTitle')}</p>
          <p className="text-muted-foreground text-sm">{t('upload.dropSubtitle')}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={(event) => {
            event.stopPropagation()
            open()
          }}
        >
          {t('upload.browse')}
        </Button>
        <p className="text-muted-foreground bg-muted/60 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs">
          <ClipboardPaste className="size-3.5" />
          {t('upload.pasteHint')}
        </p>
      </div>
    </div>
  )
}
