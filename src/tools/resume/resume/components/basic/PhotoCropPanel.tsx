import { Link2, RotateCcw, RotateCw, Trash2, Upload, ZoomIn, ZoomOut } from 'lucide-react'
import { useEffect, useImperativeHandle, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

import { renderCroppedImage } from '../../image-utils'
import {
  CROP_HANDLES,
  CROP_MAX_ZOOM,
  CROP_MIN_ZOOM,
  CROP_ZOOM_STEP,
  IDENTITY_CROP_VIEW,
  canvasFitScale,
  clampCropFrame,
  cropBounds,
  cropFrameRatio,
  imageRectFor,
  initialCropFrame,
  resizeCropFrame,
  rotateCropView,
  zoomCropView,
} from '../../photo-crop.service'
import { photoBorderRadiusValue } from '../../resume.service'
import type { CropHandle, CropRect, CropSize, CropView } from '../../photo-crop.service'
import type { PhotoAspectRatio, PhotoBorderRadius, PhotoConfig } from '../../types'

/** 比例下拉：具名比例锁形状，自定义 ＝ 自由拖拽 */
const ASPECT_RATIO_OPTIONS: readonly PhotoAspectRatio[] = ['1:1', '4:3', '3:4', '16:9', 'custom']
const BORDER_RADIUS_OPTIONS: readonly PhotoBorderRadius[] = ['none', 'medium', 'full', 'custom']

/** 8 个手柄在框上的落位与光标 */
const HANDLE_STYLES: Record<CropHandle, string> = {
  nw: 'top-0 left-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize',
  n: 'top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize',
  ne: 'top-0 left-full -translate-x-1/2 -translate-y-1/2 cursor-nesw-resize',
  e: 'top-1/2 left-full -translate-x-1/2 -translate-y-1/2 cursor-ew-resize',
  se: 'top-full left-full -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize',
  s: 'top-full left-1/2 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize',
  sw: 'top-full left-0 -translate-x-1/2 -translate-y-1/2 cursor-nesw-resize',
  w: 'top-1/2 left-0 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize',
}

export type PhotoCropPanelHandle = {
  /** 导出裁剪结果；没图或图片拿不到像素（跨域链接）时返回 null */
  exportCroppedImage: () => string | null
}

type PhotoCropPanelProps = {
  /** 图片地址；空串表示还没选图 */
  src: string
  config: PhotoConfig
  /** 改比例/圆角等纸面设置，父级负责写回 store（比例会顺手同步纸面宽高） */
  onConfigChange: (patch: Partial<PhotoConfig>) => void
  /** 当前图片若是链接，用来预填"图片链接"弹层 */
  sourceUrl: string
  onPickFile: () => void
  onUrlSubmit: (url: string) => void
  onRemove: () => void
  onFile: (file: File) => void
  /** React 19：函数组件的 ref 直接作为 props 传入 */
  ref?: React.Ref<PhotoCropPanelHandle>
}

/**
 * 头像裁剪面板：整图摆进画布居中（棋盘格是图片外的底），上面拖出一个截图式选区。
 *
 * 选区可拖动、可拉 8 个手柄缩放，被约束在图片范围内，框外压暗；圆角设置直接长在选区上，
 * 所见即所得。画布下方的工具条管旋转/缩放/比例/圆角与换图，父级只在"完成"时取一次导出结果。
 */
export function PhotoCropPanel({
  src,
  config,
  onConfigChange,
  sourceUrl,
  onPickFile,
  onUrlSubmit,
  onRemove,
  onFile,
  ref,
}: PhotoCropPanelProps) {
  const { t } = useTranslation('tools-resume')
  const stageRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const dragRef = useRef<{
    pointerId: number
    x: number
    y: number
    frame: CropRect
    handle: CropHandle | null
  } | null>(null)
  const [canvasSize, setCanvasSize] = useState<CropSize>({ width: 0, height: 0 })
  const [imageSize, setImageSize] = useState<CropSize>({ width: 0, height: 0 })
  const [view, setView] = useState<CropView>(IDENTITY_CROP_VIEW)
  const [frame, setFrame] = useState<CropRect | null>(null)
  const [failed, setFailed] = useState(false)
  const [dropActive, setDropActive] = useState(false)
  const [urlOpen, setUrlOpen] = useState(false)
  const [urlDraft, setUrlDraft] = useState('')

  // 换图回到整图 + 初始选区；换比例只重置选区。都用渲染期比对 prev 完成，
  // 放进 effect 里 setState 会多推一轮渲染（React 官方的 adjusting-state 写法）
  const [loadedSrc, setLoadedSrc] = useState(src)
  if (loadedSrc !== src) {
    setLoadedSrc(src)
    setImageSize({ width: 0, height: 0 })
    setView(IDENTITY_CROP_VIEW)
    setFrame(null)
    setFailed(false)
  }

  const [loadedRatio, setLoadedRatio] = useState(config.aspectRatio)
  if (loadedRatio !== config.aspectRatio) {
    setLoadedRatio(config.aspectRatio)
    setFrame(null)
  }

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) {
      return
    }
    const measure = () => {
      setCanvasSize({ width: stage.clientWidth, height: stage.clientHeight })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(stage)
    return () => observer.disconnect()
  }, [])

  const ratio = cropFrameRatio(config.aspectRatio)
  const imageRect = imageRectFor(canvasSize, imageSize, view)
  const bounds = cropBounds(canvasSize, imageRect)
  const fitScale = canvasFitScale(canvasSize, imageSize)
  const ready = Boolean(src) && !failed && imageSize.width > 0 && canvasSize.width > 0
  const emptyState = !src || failed
  // 渲染与导出一律用夹取后的选区：缩放、旋转、换比例后都自动回到图片范围内
  const safeFrame = clampCropFrame(frame ?? initialCropFrame(bounds, ratio), ratio, bounds)

  useImperativeHandle(
    ref,
    () => ({
      exportCroppedImage: () => {
        const image = imageRef.current
        if (!image || !ready || !src.startsWith('data:')) {
          return null
        }
        return renderCroppedImage({
          image,
          imageSize,
          canvas: canvasSize,
          frame: safeFrame,
          view,
        })
      },
    }),
    [ready, src, imageSize, canvasSize, safeFrame, view],
  )

  const beginDrag = (event: React.PointerEvent<HTMLDivElement>, handle: CropHandle | null) => {
    if (!ready) {
      return
    }
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      frame: safeFrame,
      handle,
    }
  }

  const moveDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) {
      return
    }

    const deltaX = event.clientX - drag.x
    const deltaY = event.clientY - drag.y

    if (drag.handle) {
      setFrame(resizeCropFrame(drag.frame, drag.handle, deltaX, deltaY, ratio, bounds))
      return
    }

    setFrame(
      clampCropFrame(
        { ...drag.frame, x: drag.frame.x + deltaX, y: drag.frame.y + deltaY },
        ratio,
        bounds,
      ),
    )
  }

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) {
      return
    }
    dragRef.current = null
  }

  const hint = emptyState
    ? t('resume.photoConfig.dragHint')
    : src.startsWith('data:')
      ? t('resume.photoConfig.cropHint')
      : t('resume.photoConfig.cropExternalHint')

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={stageRef}
        onDragOver={(event) => {
          event.preventDefault()
          setDropActive(true)
        }}
        onDragLeave={(event) => {
          event.preventDefault()
          setDropActive(false)
        }}
        onDrop={(event) => {
          event.preventDefault()
          setDropActive(false)
          const file = event.dataTransfer.files[0]
          if (file) {
            onFile(file)
          }
        }}
        className={cn(
          'checkerboard relative aspect-[16/10] w-full overflow-hidden rounded-xl border',
          dropActive && 'border-primary ring-ring/40 ring-2',
        )}
      >
        {emptyState ? (
          <button
            type="button"
            onClick={onPickFile}
            className="text-muted-foreground hover:text-foreground absolute inset-0 flex flex-col items-center justify-center gap-2 transition-colors"
          >
            <Upload className="size-5" />
            <span className="text-xs">{t('resume.photoConfig.upload')}</span>
          </button>
        ) : (
          <>
            <img
              ref={imageRef}
              src={src}
              alt=""
              draggable={false}
              onLoad={(event) => {
                setImageSize({
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight,
                })
              }}
              onError={() => setFailed(true)}
              className="absolute top-1/2 left-1/2 max-w-none select-none"
              style={{
                width: imageSize.width > 0 ? imageSize.width : undefined,
                height: imageSize.height > 0 ? imageSize.height : undefined,
                visibility: ready ? 'visible' : 'hidden',
                transform: `translate(-50%, -50%) rotate(${view.rotation}deg) scale(${fitScale * view.zoom})`,
              }}
            />

            {ready && (
              <div
                onPointerDown={(event) => beginDrag(event, null)}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                className="absolute cursor-move touch-none shadow-[0_0_0_9999px_rgb(0_0_0/0.5)] select-none"
                style={{
                  left: safeFrame.x,
                  top: safeFrame.y,
                  width: safeFrame.width,
                  height: safeFrame.height,
                  borderRadius: photoBorderRadiusValue(config),
                }}
              >
                <div
                  className="border-primary pointer-events-none absolute inset-0 border"
                  style={{ borderRadius: photoBorderRadiusValue(config) }}
                />

                {CROP_HANDLES.map((handle) => (
                  <div
                    key={handle}
                    onPointerDown={(event) => {
                      event.stopPropagation()
                      beginDrag(event, handle)
                    }}
                    onPointerMove={moveDrag}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                    className={cn(
                      'bg-primary border-background absolute size-3 touch-none rounded-full border-2',
                      HANDLE_STYLES[handle],
                    )}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={!ready}
            aria-label={t('resume.photoConfig.rotateLeft')}
            title={t('resume.photoConfig.rotateLeft')}
            onClick={() => setView((current) => rotateCropView(current, -90))}
          >
            <RotateCcw className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={!ready}
            aria-label={t('resume.photoConfig.rotateRight')}
            title={t('resume.photoConfig.rotateRight')}
            onClick={() => setView((current) => rotateCropView(current, 90))}
          >
            <RotateCw className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={!ready || view.zoom >= CROP_MAX_ZOOM}
            aria-label={t('resume.photoConfig.zoomIn')}
            title={t('resume.photoConfig.zoomIn')}
            onClick={() => setView((current) => zoomCropView(current, CROP_ZOOM_STEP))}
          >
            <ZoomIn className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={!ready || view.zoom <= CROP_MIN_ZOOM}
            aria-label={t('resume.photoConfig.zoomOut')}
            title={t('resume.photoConfig.zoomOut')}
            onClick={() => setView((current) => zoomCropView(current, -CROP_ZOOM_STEP))}
          >
            <ZoomOut className="size-4" />
          </Button>

          <Select
            value={config.aspectRatio}
            onValueChange={(value) => onConfigChange({ aspectRatio: value as PhotoAspectRatio })}
          >
            <SelectTrigger
              size="sm"
              className="ml-1 w-24"
              aria-label={t('resume.photoConfig.aspectRatio')}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ASPECT_RATIO_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option === 'custom' ? t('resume.photoConfig.ratios.custom') : option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={config.borderRadius}
            onValueChange={(value) => onConfigChange({ borderRadius: value as PhotoBorderRadius })}
          >
            <SelectTrigger
              size="sm"
              className="w-24"
              aria-label={t('resume.photoConfig.borderRadius')}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BORDER_RADIUS_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {t(`resume.photoConfig.borderRadiusOptions.${option}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {config.borderRadius === 'custom' && (
            <Input
              type="number"
              min={0}
              max={Math.min(config.width, config.height) / 2}
              value={config.customBorderRadius}
              aria-label={t('resume.photoConfig.borderRadiusOptions.custom')}
              className="no-spinner h-7 w-16"
              onChange={(event) =>
                onConfigChange({ customBorderRadius: Number(event.target.value) || 0 })
              }
            />
          )}
        </div>

        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={emptyState}
            aria-label={t('resume.photoConfig.remove')}
            title={t('resume.photoConfig.remove')}
            onClick={onRemove}
          >
            <Trash2 className="text-destructive size-4" />
          </Button>

          <Popover
            open={urlOpen}
            onOpenChange={(next) => {
              setUrlOpen(next)
              if (next) {
                setUrlDraft(sourceUrl)
              }
            }}
          >
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="rounded-full">
                <Link2 />
                {t('resume.photoConfig.urlTitle')}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72">
              <form
                className="flex flex-col gap-2"
                onSubmit={(event) => {
                  event.preventDefault()
                  const url = urlDraft.trim()
                  if (!url) {
                    return
                  }
                  onUrlSubmit(url)
                  setUrlOpen(false)
                }}
              >
                <Input
                  autoFocus
                  value={urlDraft}
                  placeholder={t('resume.photoConfig.urlPlaceholder')}
                  aria-label={t('resume.photoConfig.urlTitle')}
                  onChange={(event) => setUrlDraft(event.target.value)}
                />
                <Button type="submit" size="sm" disabled={!urlDraft.trim()}>
                  {t('resume.photoConfig.urlApply')}
                </Button>
              </form>
            </PopoverContent>
          </Popover>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={onPickFile}
          >
            <Upload />
            {t('resume.photoConfig.localImage')}
          </Button>
        </div>
      </div>

      <p className="text-muted-foreground text-center text-xs">{hint}</p>
    </div>
  )
}
