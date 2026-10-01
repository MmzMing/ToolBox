import { ClipboardPaste, ImageUp, FolderOpen } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { filesFromDataTransfer, imageFilesFromClipboard } from '@/utils/data-transfer-files'

type DropZoneBaseProps = {
  /** 原生 input accept，如 'image/gif' 或 'video/mp4,.mov' */
  accept: string
  multiple?: boolean
  /** 允许选整个文件夹（图片批量类工具用） */
  allowFolder?: boolean
  browseLabel: string
  folderLabel?: string
  pasteHint?: string
  onFiles: (files: File[]) => void
}

function useFilePickers({ accept, multiple, allowFolder, onFiles }: DropZoneBaseProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const folderRef = useRef<HTMLInputElement>(null)

  const take = useCallback(
    (list: FileList | null) => {
      if (list?.length) onFiles(Array.from(list))
    },
    [onFiles],
  )

  const inputs = (
    <>
      <input
        ref={fileRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(event) => {
          take(event.target.files)
          event.target.value = ''
        }}
      />
      {allowFolder && (
        <input
          ref={folderRef}
          type="file"
          accept={accept}
          multiple
          className="hidden"
          {...({ webkitdirectory: '' } as React.InputHTMLAttributes<HTMLInputElement>)}
          onChange={(event) => {
            take(event.target.files)
            event.target.value = ''
          }}
        />
      )}
    </>
  )

  return { fileRef, folderRef, inputs }
}

/** 工作区里「继续添加」用的一排按钮 */
export function FileAddButtons(props: DropZoneBaseProps) {
  const { browseLabel, folderLabel, pasteHint, allowFolder } = props
  const { fileRef, folderRef, inputs } = useFilePickers(props)

  return (
    <div className="flex flex-wrap items-center gap-2">
      {inputs}
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => fileRef.current?.click()}
      >
        <ImageUp className="size-4" />
        {browseLabel}
      </Button>
      {allowFolder && folderLabel && (
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => folderRef.current?.click()}
        >
          <FolderOpen className="size-4" />
          {folderLabel}
        </Button>
      )}
      {pasteHint && (
        <span className="text-muted-foreground hidden items-center gap-1 text-xs sm:inline-flex">
          <ClipboardPaste className="size-3.5" />
          {pasteHint}
        </span>
      )}
    </div>
  )
}

type FileDropZoneProps = DropZoneBaseProps & {
  title: string
  subtitle: string
  /** 空态图标，默认图片上传 */
  icon?: React.ComponentType<{ className?: string }>
  minHeightClass?: string
}

/**
 * 首屏上传区：点击 / 拖拽（含文件夹）/ 剪贴板粘贴。
 * 与 image-compressor、image-stack 的上传区同一套交互与视觉，新工具不再各写一份。
 */
export function FileDropZone({
  title,
  subtitle,
  icon: Icon = ImageUp,
  minHeightClass = 'min-h-[420px]',
  pasteHint,
  ...rest
}: FileDropZoneProps) {
  const { fileRef, folderRef, inputs } = useFilePickers(rest)
  const { allowFolder, folderLabel, browseLabel, onFiles } = rest
  const [dragOver, setDragOver] = useState(false)

  const open = useCallback(() => fileRef.current?.click(), [fileRef])

  useEffect(() => {
    if (!pasteHint) return
    const onPaste = (event: ClipboardEvent) => {
      const files = imageFilesFromClipboard(event.clipboardData)
      if (files.length > 0) onFiles(files)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [pasteHint, onFiles])

  return (
    <div>
      {inputs}
      <div
        role="button"
        tabIndex={0}
        onClick={open}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') open()
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
            if (files.length > 0) onFiles(files)
          })
        }}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed p-8 text-center transition-colors',
          minHeightClass,
          dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50',
        )}
      >
        <span className="bg-primary/10 text-primary flex size-16 items-center justify-center rounded-2xl">
          <Icon className="size-8" />
        </span>
        <div className="flex flex-col gap-1">
          <p className="text-base font-semibold">{title}</p>
          <p className="text-muted-foreground text-sm">{subtitle}</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={(event) => {
              event.stopPropagation()
              open()
            }}
          >
            {browseLabel}
          </Button>
          {allowFolder && folderLabel && (
            <Button
              variant="outline"
              size="sm"
              onClick={(event) => {
                event.stopPropagation()
                folderRef.current?.click()
              }}
            >
              {folderLabel}
            </Button>
          )}
        </div>
        {pasteHint && (
          <p className="text-muted-foreground bg-muted/60 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs">
            <ClipboardPaste className="size-3.5" />
            {pasteHint}
          </p>
        )}
      </div>
    </div>
  )
}
