import { ImageUp, FolderOpen, ClipboardPaste } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { filesFromDataTransfer } from '@/utils/data-transfer-files'
import { addFilesAndDispatch } from '../use-compressor-worker'

interface UploadZoneProps {
  compact?: boolean
}

/** 上传区：点击/拖拽（支持文件夹）/剪贴板粘贴；compact 模式用于列表上方的继续添加 */
export function UploadZone({ compact = false }: UploadZoneProps) {
  const { t } = useTranslation('tools-images', { keyPrefix: 'image-compressor' })
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)

  const addFromInput = useCallback((files: FileList | null) => {
    if (!files) {
      return
    }
    void addFilesAndDispatch(Array.from(files))
  }, [])

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const files: File[] = []
      for (const item of event.clipboardData?.items ?? []) {
        const file = item.getAsFile()
        if (file) {
          files.push(file)
        }
      }
      if (files.length > 0) {
        void addFilesAndDispatch(files)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [])

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    setDragOver(false)
    void filesFromDataTransfer(event.dataTransfer).then((files) => {
      if (files.length > 0) {
        void addFilesAndDispatch(files)
      }
    })
  }, [])

  const inputProps = { multiple: true, accept: 'image/*,.heic,.heif' } as const

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          {...inputProps}
          onChange={(event) => {
            addFromInput(event.target.files)
            event.target.value = ''
          }}
        />
        <input
          ref={folderInputRef}
          type="file"
          className="hidden"
          {...({
            ...inputProps,
            webkitdirectory: '',
          } as React.InputHTMLAttributes<HTMLInputElement>)}
          onChange={(event) => {
            addFromInput(event.target.files)
            event.target.value = ''
          }}
        />
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => fileInputRef.current?.click()}
        >
          <ImageUp className="size-4" />
          {t('workspace.addFiles')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => folderInputRef.current?.click()}
        >
          <FolderOpen className="size-4" />
          {t('workspace.addFolder')}
        </Button>
        <span className="text-muted-foreground hidden items-center gap-1 text-xs sm:inline-flex">
          <ClipboardPaste className="size-3.5" />
          {t('workspace.pasteHint')}
        </span>
      </div>
    )
  }

  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        {...inputProps}
        onChange={(event) => {
          addFromInput(event.target.files)
          event.target.value = ''
        }}
      />
      <input
        ref={folderInputRef}
        type="file"
        className="hidden"
        {...({ ...inputProps, webkitdirectory: '' } as React.InputHTMLAttributes<HTMLInputElement>)}
        onChange={(event) => {
          addFromInput(event.target.files)
          event.target.value = ''
        }}
      />

      <div
        role="button"
        tabIndex={0}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            fileInputRef.current?.click()
          }
        }}
        onDragOver={(event) => {
          event.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`flex min-h-[420px] cursor-pointer flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
          dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
        }`}
      >
        <span className="bg-primary/10 text-primary flex size-16 items-center justify-center rounded-2xl">
          <ImageUp className="size-8" />
        </span>
        <div className="flex flex-col gap-1">
          <p className="text-base font-semibold">{t('workspace.dropTitle')}</p>
          <p className="text-muted-foreground text-sm">{t('workspace.dropSubtitle')}</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={(event) => {
              event.stopPropagation()
              fileInputRef.current?.click()
            }}
          >
            {t('workspace.addFiles')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={(event) => {
              event.stopPropagation()
              folderInputRef.current?.click()
            }}
          >
            {t('workspace.addFolder')}
          </Button>
        </div>
        <p className="text-muted-foreground bg-muted/60 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs">
          <ClipboardPaste className="size-3.5" />
          {t('workspace.pasteHint')}
        </p>
      </div>
    </div>
  )
}
