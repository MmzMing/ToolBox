import { useEffect, useRef, useState } from 'react'
import { Eraser, ImageUp, Loader2, ScanLine } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { TextareaCopyable } from '@/components/copyable/textarea-copyable'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { QR_DECODE_MAX_SIDE, decodeQrFromPixels } from '../qr-code.service'

type DecodeState =
  | { kind: 'idle' }
  | { kind: 'decoding' }
  | { kind: 'done'; text: string }
  | { kind: 'notfound' }
  | { kind: 'error' }

interface PickedImage {
  url: string
  name: string
}

/** 把图片文件画到离屏 canvas 上取出 RGBA 像素，超过上限的边长先等比缩小 */
async function readImagePixels(file: File) {
  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, QR_DECODE_MAX_SIDE / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) {
      throw new Error('Canvas 2D context is unavailable in this browser')
    }
    context.drawImage(bitmap, 0, 0, width, height)
    return context.getImageData(0, 0, width, height)
  } finally {
    bitmap.close()
  }
}

interface DetectPanelProps {
  /** 仅在 Tab 处于激活态时接管全局粘贴事件，避免在生成页粘图却看不见反应 */
  active: boolean
}

/** 识别侧：拖拽 / 粘贴 / 选取二维码图片，解出其中编码的文本 */
export function DetectPanel({ active }: DetectPanelProps) {
  const { t } = useTranslation('tools-images', { keyPrefix: 'qr-code.detect' })

  const [image, setImage] = useState<PickedImage | null>(null)
  const [state, setState] = useState<DecodeState>({ kind: 'idle' })
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  /** 每次选取都自增，晚到的异步结果据此作废，防止旧图覆盖新图 */
  const runIdRef = useRef(0)

  useEffect(() => {
    if (!image) {
      return
    }
    return () => URL.revokeObjectURL(image.url)
  }, [image])

  const handleFile = (file: File) => {
    const runId = ++runIdRef.current
    setImage({ url: URL.createObjectURL(file), name: file.name })
    setState({ kind: 'decoding' })
    void readImagePixels(file)
      .then((imageData) => decodeQrFromPixels(imageData.data, imageData.width, imageData.height))
      .then((text) => {
        if (runIdRef.current !== runId) {
          return
        }
        setState(text === null ? { kind: 'notfound' } : { kind: 'done', text })
      })
      .catch(() => {
        if (runIdRef.current !== runId) {
          return
        }
        setState({ kind: 'error' })
      })
  }

  useEffect(() => {
    if (!active) {
      return
    }
    const onPaste = (event: ClipboardEvent) => {
      for (const item of event.clipboardData?.items ?? []) {
        if (!item.type.startsWith('image/')) {
          continue
        }
        const file = item.getAsFile()
        if (file) {
          handleFile(file)
          return
        }
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [active])

  const handleClear = () => {
    runIdRef.current += 1
    setImage(null)
    setState({ kind: 'idle' })
  }

  return (
    <div className="flex flex-col gap-4">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const picked = event.target.files?.[0]
          if (picked) {
            handleFile(picked)
          }
          event.target.value = ''
        }}
      />

      <div
        role="button"
        tabIndex={0}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            fileInputRef.current?.click()
          }
        }}
        onDragOver={(event) => {
          event.preventDefault()
          setIsDragOver(true)
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(event) => {
          event.preventDefault()
          setIsDragOver(false)
          const dropped = event.dataTransfer.files[0]
          if (dropped) {
            handleFile(dropped)
          }
        }}
        className={`flex min-h-40 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
          isDragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
        }`}
      >
        <span className="bg-primary/10 text-primary flex size-12 items-center justify-center rounded-xl">
          <ScanLine className="size-6" />
        </span>
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">{t('dropTitle')}</p>
          <p className="text-muted-foreground text-xs">{t('dropHint')}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={(event) => {
            event.stopPropagation()
            fileInputRef.current?.click()
          }}
        >
          <ImageUp className="size-4" />
          {t('chooseFile')}
        </Button>
      </div>

      {image && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-muted-foreground flex items-center gap-2 text-xs font-normal">
              {t('sourceLabel')}
              <span className="max-w-48 truncate">{image.name}</span>
            </Label>
            <Button variant="ghost" size="sm" className="gap-1.5" onClick={handleClear}>
              <Eraser className="size-4" />
              {t('clear')}
            </Button>
          </div>
          <img
            src={image.url}
            alt="QR code source"
            className="max-h-64 w-auto max-w-full self-start rounded-lg border object-contain"
          />
        </div>
      )}

      {state.kind === 'decoding' && (
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" />
          {t('decoding')}
        </p>
      )}

      {(state.kind === 'notfound' || state.kind === 'error') && (
        <Alert variant="destructive">
          <AlertDescription>
            {state.kind === 'notfound' ? t('notFound') : t('decodeFailed')}
          </AlertDescription>
        </Alert>
      )}

      {state.kind === 'done' && (
        <div className="flex flex-col gap-2">
          <Label>{t('resultLabel')}</Label>
          <TextareaCopyable value={state.text} rows={4} />
        </div>
      )}
    </div>
  )
}
