import {
  Copy,
  Eraser,
  FlipHorizontal2,
  FlipVertical2,
  ImageOff,
  Images,
  Loader2,
  Package,
  Pause,
  Play,
  Repeat,
  Replace,
  RotateCcw,
  ShieldCheck,
  Square,
  SquareCheck,
  SquareDashed,
  Trash2,
  Undo2,
  Wand2,
  X,
} from 'lucide-react'
import JSZip from 'jszip'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { FileDropZone } from '@/components/file-drop-zone'
import { CopyLinkButton } from '@/components/copy-link-button'
import { FavoriteButton } from '@/components/favorite-button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  PanelField,
  PanelGroup,
  PanelSection,
  PanelSelectField,
  PanelSwitchField,
} from '@/components/panel-fields'
import { Progress } from '@/components/ui/progress'
import { Slider } from '@/components/ui/slider'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useIsMobile } from '@/composable/use-breakpoint'
import { centerCrop, clampRect, isFullRect } from '@/modules/gif/crop'
import { SPEED_STEPS, csToSeconds, secondsOf, secondsToCs } from '@/modules/gif/speed'
import { frameToImageData, resizeImage, type RotateDegrees } from '@/modules/gif/transform'
import type { GifDescriptor, RgbaFrame } from '@/modules/gif/types'
import { useGifWorker } from '@/modules/gif/worker/use-gif-worker'
import { boomerang, deleteAt, duplicateAt, moveItem, reverseItems } from '@/utils/array-ops'
import { cn } from '@/lib/utils'
import { downloadBlob } from '@/utils/download'

import { CropOverlay } from './crop-overlay'
import { FrameThumb } from './frame-thumb'
import {
  boomerangCount,
  CROP_RATIOS,
  EDITOR_MODES,
  type EditorMode,
  type EditSnapshot,
  type EditorTransforms,
  editorBudget,
  exportSize,
  frameDelays,
  loadPercent,
  type LoadPhase,
  pngFrameName,
  previewSize,
  pushSnapshot,
  ROTATIONS,
  WIDTH_OPTIONS,
} from './gif-editor.service'
import { tool } from './index'
import { applyEditorTransforms, rotatedBounds, useFramePlayer } from './use-frame-player'

const DEFAULT_TRANSFORMS: EditorTransforms = {
  rotate: 0,
  flipX: false,
  flipY: false,
  crop: null,
  speed: 1,
  width: 320,
  loopCount: 0,
  optimize: true,
}

/** 只有图标的按钮：把已翻译的名字挂在悬停气泡上，否则只能靠猜图标 */
function HintButton({
  label,
  icon,
  onClick,
  disabled,
}: {
  label: string
  icon: ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          disabled={disabled}
          onClick={onClick}
          aria-label={label}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}

/** 逐帧编辑器：上预览、中播放与进度条、下缩略图卡片，卡片点击即跳转 */
export default function GifEditor() {
  const { t } = useTranslation('tools-images', { keyPrefix: 'gif-editor' })
  const isMobile = useIsMobile()
  const { decode, encode, optimize } = useGifWorker()
  const mergeRef = useRef<HTMLInputElement>(null)
  const replaceRef = useRef<HTMLInputElement>(null)
  const previewRef = useRef<HTMLCanvasElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const stripRef = useRef<HTMLDivElement>(null)

  const [frames, setFrames] = useState<RgbaFrame[]>([])
  const [meta, setMeta] = useState<GifDescriptor | null>(null)
  const [fileName, setFileName] = useState('source.gif')
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [transforms, setTransforms] = useState<EditorTransforms>(DEFAULT_TRANSFORMS)
  const [ratioId, setRatioId] = useState('free')
  const [history, setHistory] = useState<EditSnapshot[]>([])
  // 拖拽源用 ref：dragstart 与 drop 之间没有重渲染也读得到，state 只负责画落点高亮
  const dragFromRef = useRef<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)
  const [mode, setMode] = useState<EditorMode>('simple')
  // 乒乓会把帧数翻倍，容易一步顶破预算上限，所以先弹窗把数字摆出来
  const [confirmBoomerang, setConfirmBoomerang] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stageBox, setStageBox] = useState<{ width: number; height: number } | null>(null)
  const [loading, setLoading] = useState<{ phase: LoadPhase; total: number } | null>(null)

  // 预览面尺寸：flex-1 的剩余空间只有布局算完才知道，先同步量一次再挂观察器
  useEffect(() => {
    const element = boxRef.current
    if (!element) return
    const read = () => {
      const box = element.getBoundingClientRect()
      setStageBox({ width: box.width, height: box.height })
    }
    read()
    const observer = new ResizeObserver(read)
    observer.observe(element)
    return () => observer.disconnect()
  }, [meta])

  const bounds = meta ? rotatedBounds(meta, transforms.rotate) : null
  const isDetail = mode === 'detail'
  const crop = transforms.crop && bounds ? clampRect(transforms.crop, bounds) : null
  // 铺满整帧的框等于没裁：让「自由」模式可以从满框开始往里缩
  const isCropped = crop && bounds && !isFullRect(crop, bounds)
  const applied: EditorTransforms = { ...transforms, crop: isCropped ? crop : null }
  const size = meta ? exportSize(meta, applied) : null
  const preview = meta && bounds ? previewSize(meta, transforms) : null
  const delays = useMemo(() => frameDelays(frames, transforms.speed), [frames, transforms.speed])
  const budget = size ? editorBudget(delays.delaysCs, size, isMobile) : null
  const ratio = CROP_RATIOS.find((item) => item.id === ratioId)?.ratio ?? null
  // 预览按可用空间等比缩放：小图放大看清单帧，大图缩小以免顶破版面
  const previewScale =
    !preview || !stageBox
      ? 1
      : Math.min(
          Math.max(
            Math.min(
              (stageBox.width - 24) / preview.width,
              (stageBox.height - 24) / preview.height,
            ),
            0.1,
          ),
          4,
        )

  const signature = [
    transforms.rotate,
    transforms.flipX,
    transforms.flipY,
    preview ? `${preview.width}x${preview.height}` : 'none',
    frames.length,
  ].join('|')

  const { playing, playhead, toggle, seek } = useFramePlayer({
    canvasRef: previewRef,
    frames,
    delaysCs: delays.delaysCs,
    // 预览永远画整帧不裁剪：裁剪框坐标系的基准就是整帧，画布一缩框就歪
    transforms: { ...transforms, crop: null },
    size: preview,
    signature,
  })

  // 播放头滚进可视区：只在自己不可见时挪 scrollTop，可见时一动不动
  useEffect(() => {
    const strip = stripRef.current
    const card = strip?.querySelector<HTMLElement>(`[data-frame-index="${playhead}"]`)
    if (!strip || !card) return
    const top = card.offsetTop
    const bottom = top + card.offsetHeight
    if (top < strip.scrollTop) {
      strip.scrollTop = top
    } else if (bottom > strip.scrollTop + strip.clientHeight) {
      strip.scrollTop = bottom - strip.clientHeight
    }
  }, [playhead, frames.length])

  const loadFile = useCallback(
    async (file: File) => {
      setError(null)
      setLoading({ phase: 'read', total: 0 })
      try {
        const bytes = await file.arrayBuffer()
        setLoading({ phase: 'parse', total: 0 })
        const decoded = await decode(bytes, (progress) => {
          // 这条通道只会发 parse/frames，matte 阶段属于另一组请求
          if (progress.phase === 'parse' || progress.phase === 'frames') {
            setLoading({ phase: progress.phase, total: progress.total })
          }
        })
        setFrames(decoded.frames)
        setMeta(decoded.descriptor)
        setFileName(file.name)
        setChecked(new Set())
        setTransforms({
          ...DEFAULT_TRANSFORMS,
          width: Math.min(DEFAULT_TRANSFORMS.width, decoded.descriptor.width),
        })
        setRatioId('free')
        // 换文件等于换作品：旧快照指向的是上一张图的帧，留着只会撤销出鬼来
        setHistory([])
      } catch {
        setError(t('error-invalid'))
      } finally {
        setLoading(null)
      }
    },
    [decode, t],
  )

  /** 离散操作前压一步；连续动作（拖裁剪框）在指针按下时压一次，而不是每像素一次 */
  const push = () => setHistory((current) => pushSnapshot(current, { frames, transforms, ratioId }))

  const undo = () => {
    const previous = history[history.length - 1]
    if (!previous) return
    setFrames([...previous.frames])
    setTransforms(previous.transforms)
    setRatioId(previous.ratioId)
    setChecked(new Set())
    setHistory((current) => current.slice(0, -1))
  }

  const editTransforms = (patch: Partial<EditorTransforms>) => {
    push()
    setTransforms((current) => ({ ...current, ...patch }))
  }

  const applyToFrames = (next: RgbaFrame[]) => {
    push()
    setFrames(next)
    setChecked(new Set())
  }

  const allIndexes = () => new Set(frames.map((_, index) => index))

  const toggleAllChecked = () =>
    setChecked(checked.size === frames.length ? new Set() : allIndexes())

  const invertChecked = () =>
    setChecked(new Set([...allIndexes()].filter((index) => !checked.has(index))))

  /** 松手才真改：拖到半路的下标只用来画高亮，撤销栈里只留最终这一次移动 */
  const dropDraggedFrame = (target: number) => {
    const from = dragFromRef.current
    dragFromRef.current = null
    setDragOver(null)
    if (from === null || from === target) return
    applyToFrames(moveItem(frames, from, target))
  }

  const clearTransforms = () => {
    push()
    setTransforms({
      ...DEFAULT_TRANSFORMS,
      width: meta ? Math.min(DEFAULT_TRANSFORMS.width, meta.width) : DEFAULT_TRANSFORMS.width,
    })
    setRatioId('free')
  }

  const dropImage = () => {
    setFrames([])
    setMeta(null)
    setChecked(new Set())
    setTransforms(DEFAULT_TRANSFORMS)
    setRatioId('free')
    setHistory([])
    setError(null)
  }

  const mergeAnother = async (file: File) => {
    const first = frames[0]
    if (!first) return
    try {
      const decoded = await decode(await file.arrayBuffer())
      const target = { width: first.width, height: first.height }
      applyToFrames([
        ...frames,
        ...decoded.frames.map((frame) => ({
          ...resizeImage(frame, target),
          delayCs: frame.delayCs,
        })),
      ])
    } catch {
      setError(t('error-invalid'))
    }
  }

  const setRatio = (id: string) => {
    push()
    setRatioId(id)
    const picked = CROP_RATIOS.find((item) => item.id === id)?.ratio
    setTransforms((current) => ({
      ...current,
      // 自由也要给出一个满框：没有框就没有可拖的东西，自由裁剪等于用不了
      crop: bounds ? clampRect(centerCrop(bounds, picked ?? null), bounds) : null,
    }))
  }

  async function exportGif() {
    if (!size || frames.length === 0) return
    setBusy(true)
    setError(null)
    try {
      const prepared = frames.map((frame, index) => ({
        ...applyEditorTransforms(frame, applied, size),
        delayCs: delays.delaysCs[index],
      }))
      const encoded = await encode(prepared, {
        maxColors: 256,
        loopCount: transforms.loopCount,
        delayCs: prepared[0].delayCs,
      })
      const blob = transforms.optimize
        ? await optimize(await encoded.arrayBuffer(), { optimizeLevel: 3, maxColors: 256 })
        : encoded
      // 成品不再驻留在页面里：直接交给浏览器下载，省掉一张只会占位的结果卡
      downloadBlob(blob, `${fileName.replace(/\.gif$/i, '') || 'source'}-edited.gif`)
      toast.success(t('export-done'))
    } catch {
      setError(t('error-export'))
    } finally {
      setBusy(false)
    }
  }

  /** 只导出勾选的帧；文件名沿用原帧号，挑出来的图还能对回时间轴 */
  async function exportFrames(selection: readonly number[]) {
    const picked = [...selection].sort((a, b) => a - b)
    if (picked.length === 0) return
    setBusy(true)
    setError(null)
    try {
      const zip = new JSZip()
      const base = fileName.replace(/\.gif$/i, '') || 'frames'
      for (const index of picked) {
        const frame = frames[index]
        const canvas = document.createElement('canvas')
        canvas.width = frame.width
        canvas.height = frame.height
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('canvas unavailable')
        ctx.putImageData(frameToImageData(frame), 0, 0)
        zip.file(
          pngFrameName(base, index),
          await new Promise<Blob>((resolve) =>
            canvas.toBlob((out) => resolve(out as Blob), 'image/png'),
          ),
        )
      }
      downloadBlob(await zip.generateAsync({ type: 'blob' }), `${base}-frames.zip`)
    } catch {
      setError(t('error-export'))
    } finally {
      setBusy(false)
    }
  }

  const workspace = loading ? (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('loading-title')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Progress value={loadPercent(loading.phase)} />
        <p className="text-muted-foreground text-xs">
          {loading.phase === 'frames' && loading.total > 0
            ? t('loading-frames', { n: loading.total })
            : t(`loading-${loading.phase}`)}
        </p>
      </CardContent>
    </Card>
  ) : !meta || !bounds || !size || !preview ? (
    <FileDropZone
      accept="image/gif,.gif"
      label={t('drop-title')}
      description={t('drop-subtitle')}
      allowPaste
      icon={Images}
      minHeightClass="min-h-[360px]"
      onFiles={(files) => void loadFile(files[0])}
    />
  ) : (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {/* 第一层：预览画布，水平垂直都居中；详情模式与帧列表按 3:2 分剩余高度 */}
      <div
        ref={boxRef}
        className={cn(
          'bg-muted/30 relative flex min-h-[220px] items-center justify-center overflow-hidden rounded-lg border',
          isDetail ? 'flex-[3_1_0%]' : 'flex-1',
        )}
      >
        <div ref={stageRef} className="relative">
          <canvas
            ref={previewRef}
            className="block"
            style={{
              width: preview.width * previewScale,
              height: preview.height * previewScale,
            }}
          />
          {crop && (
            <CropOverlay
              stageRef={stageRef}
              rect={crop}
              bounds={bounds}
              ratio={ratio}
              onBegin={push}
              onChange={(next) => setTransforms((current) => ({ ...current, crop: next }))}
            />
          )}
        </div>

        {/* 文件级操作贴着画面放：它们管的是整张 GIF，不该和逐帧控件混在右侧栏里 */}
        <div className="bg-background/80 absolute top-2 right-2 flex items-center gap-1 rounded-lg border p-1 backdrop-blur-sm">
          <HintButton
            label={t('replace')}
            icon={<Replace className="size-4" />}
            onClick={() => replaceRef.current?.click()}
          />
          <HintButton
            label={t('remove-image')}
            icon={<ImageOff className="size-4" />}
            onClick={dropImage}
          />
          <HintButton
            label={t('undo')}
            icon={<Undo2 className="size-4" />}
            disabled={history.length === 0}
            onClick={undo}
          />
          <HintButton
            label={t('reset-settings')}
            icon={<Eraser className="size-4" />}
            onClick={clearTransforms}
          />
          <input
            ref={replaceRef}
            type="file"
            accept="image/gif,.gif"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void loadFile(file)
              event.target.value = ''
            }}
          />
        </div>
      </div>

      {/* 第二层：播放按钮 + 进度条 + 时间读数 */}
      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <Button
          size="icon"
          variant="outline"
          onClick={toggle}
          aria-label={playing ? t('pause') : t('play')}
        >
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
        </Button>
        <Slider
          className="min-w-40 flex-1"
          min={0}
          max={Math.max(0, frames.length - 1)}
          step={1}
          value={[Math.min(playhead, Math.max(0, frames.length - 1))]}
          onValueChange={([value]) => seek(value ?? 0)}
        />
        <span className="text-muted-foreground w-28 text-right text-xs tabular-nums">
          {playhead + 1} / {frames.length} ·{' '}
          {secondsOf(delays.delaysCs.slice(0, playhead + 1)).toFixed(1)}s
        </span>
      </div>

      {/* 时间轴与画面翻转贴着播放条放：改的是「怎么看这段动图」，跟着预览走比塞进右栏顺手 */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="sm" variant="outline" onClick={() => applyToFrames(reverseItems(frames))}>
            <RotateCcw className="size-3.5" />
            {t('reverse')}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setConfirmBoomerang(true)}>
            <Repeat className="size-3.5" />
            {t('ping-pong')}
          </Button>
          <Button
            size="sm"
            variant={transforms.flipX ? 'secondary' : 'outline'}
            aria-pressed={transforms.flipX}
            onClick={() => editTransforms({ flipX: !transforms.flipX })}
          >
            <FlipHorizontal2 className="size-3.5" />
            {t('flip-horizontal')}
          </Button>
          <Button
            size="sm"
            variant={transforms.flipY ? 'secondary' : 'outline'}
            aria-pressed={transforms.flipY}
            onClick={() => editTransforms({ flipY: !transforms.flipY })}
          >
            <FlipVertical2 className="size-3.5" />
            {t('flip-vertical')}
          </Button>
        </div>
        <p className="text-muted-foreground text-xs">
          {t('preview-note', {
            width: size.width,
            height: size.height,
            frames: frames.length,
            seconds: secondsOf(delays.delaysCs).toFixed(1),
          })}
        </p>
      </div>

      {/* 第三层（仅详情）：帧卡片 —— 左列勾选+序号、中间图片即拖拽手柄、右列操作+延时 */}
      {isDetail && (
        <>
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <div className="flex min-w-0 items-center gap-2">
              <Button size="sm" variant="ghost" onClick={toggleAllChecked}>
                <SquareCheck className="size-3.5" />
                {t('select-all')}
              </Button>
              <span className="text-muted-foreground text-xs tabular-nums">
                {t('selected-count', { n: checked.size, total: frames.length })}
              </span>
              <span className="text-muted-foreground hidden truncate text-xs lg:inline">
                {t('drag-note')}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={invertChecked}>
                <Square className="size-3.5" />
                {t('invert-selection')}
              </Button>
              <Button size="sm" variant="outline" onClick={() => mergeRef.current?.click()}>
                <Images className="size-3.5" />
                {t('merge')}
              </Button>
              <input
                ref={mergeRef}
                type="file"
                accept="image/gif,.gif"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) void mergeAnother(file)
                  event.target.value = ''
                }}
              />
              {checked.size > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void exportFrames([...checked])}
                >
                  <Package className="size-3.5" />
                  {t('extract')}
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                disabled={checked.size === 0}
                onClick={() => applyToFrames(deleteAt(frames, [...checked]))}
              >
                <Trash2 className="size-3.5" />
                {t('delete-selected', { n: checked.size })}
              </Button>
            </div>
          </div>

          <div
            ref={stripRef}
            className="relative grid min-h-[140px] flex-[2_1_0%] auto-rows-min grid-cols-[repeat(auto-fill,minmax(196px,1fr))] content-start gap-2 overflow-y-auto pr-1"
          >
            {frames.map((frame, index) => (
              <div
                key={index}
                data-frame-index={index}
                onDragOver={(event) => {
                  const from = dragFromRef.current
                  if (from === null || from === index) return
                  event.preventDefault()
                  event.dataTransfer.dropEffect = 'move'
                  if (dragOver !== index) setDragOver(index)
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  dropDraggedFrame(index)
                }}
                className={cn(
                  'bg-muted/40 hover:border-primary/60 hover:bg-accent/60 flex min-w-0 items-stretch gap-2 rounded-lg border p-2 transition-colors',
                  playhead === index && 'border-primary',
                  dragOver === index && 'border-primary bg-accent',
                )}
              >
                <div className="flex w-6 shrink-0 flex-col items-center justify-between py-0.5">
                  <input
                    type="checkbox"
                    className="accent-primary size-4"
                    checked={checked.has(index)}
                    aria-label={t('select-frame', { n: index + 1 })}
                    onChange={(event) => {
                      const next = new Set(checked)
                      if (event.target.checked) {
                        next.add(index)
                      } else {
                        next.delete(index)
                      }
                      setChecked(next)
                    }}
                  />
                  <span className="text-muted-foreground text-[11px] tabular-nums">
                    {index + 1}
                  </span>
                </div>

                <button
                  type="button"
                  draggable
                  onDragStart={(event) => {
                    dragFromRef.current = index
                    event.dataTransfer.effectAllowed = 'move'
                    event.dataTransfer.setData('text/plain', String(index))
                  }}
                  onDragEnd={() => {
                    dragFromRef.current = null
                    setDragOver(null)
                  }}
                  onClick={() => seek(index)}
                  className="bg-background flex size-16 shrink-0 cursor-grab items-center justify-center overflow-hidden rounded active:cursor-grabbing"
                  aria-label={t('jump-to', { n: index + 1 })}
                >
                  <FrameThumb frame={frame} size={60} />
                </button>

                <div className="flex w-16 shrink-0 flex-col items-end justify-between gap-1">
                  <div className="flex items-center gap-0.5">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-6"
                      onClick={() => applyToFrames(duplicateAt(frames, index))}
                      aria-label={t('duplicate')}
                    >
                      <Copy className="size-3" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-6"
                      onClick={() => applyToFrames(deleteAt(frames, [index]))}
                      aria-label={t('remove')}
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-1">
                    <Input
                      value={csToSeconds(frame.delayCs)}
                      inputMode="decimal"
                      className="h-6 w-11 px-1 text-right font-mono text-[11px]"
                      aria-label={t('delay-label')}
                      onChange={(event) => {
                        const raw = Number(event.target.value)
                        const cs =
                          Number.isFinite(raw) && raw > 0 ? secondsToCs(raw) : frame.delayCs
                        setFrames(
                          frames.map((item, position) =>
                            position === index ? { ...item, delayCs: cs } : item,
                          ),
                        )
                      }}
                    />
                    <span className="text-muted-foreground text-[11px]">s</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )

  const panel = (
    <PanelGroup>
      <PanelSection title={t('section-transform')}>
        <PanelField span={2} label={t('ratio-label')} hint={crop ? t('crop-note') : undefined}>
          <div className="flex flex-wrap items-center gap-1.5">
            {CROP_RATIOS.map((item) => (
              <Button
                key={item.id}
                size="sm"
                variant={ratioId === item.id ? 'default' : 'outline'}
                onClick={() => setRatio(item.id)}
              >
                <SquareDashed className="size-3.5" />
                {t(`ratio-${item.id}`)}
              </Button>
            ))}
            {isCropped && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  push()
                  setRatioId('free')
                  setTransforms((current) => ({ ...current, crop: null }))
                }}
              >
                <X className="size-3.5" />
                {t('crop-reset')}
              </Button>
            )}
          </div>
        </PanelField>
        <PanelSelectField
          label={t('speed-label')}
          value={String(transforms.speed)}
          onChange={(value) => editTransforms({ speed: Number(value) })}
          options={SPEED_STEPS.map((step) => ({
            value: String(step),
            label: t('speed-times', { n: step }),
          }))}
          hint={delays.clamped > 0 ? t('speed-clamped', { n: delays.clamped }) : undefined}
        />
        <PanelSelectField
          label={t('rotate-label')}
          value={String(transforms.rotate)}
          onChange={(value) => editTransforms({ rotate: Number(value) as RotateDegrees })}
          options={ROTATIONS.map((degrees) => ({
            value: String(degrees),
            label: `${degrees}°`,
          }))}
        />
        <PanelSelectField
          label={t('width-label')}
          tip={t('width-hint')}
          value={String(transforms.width)}
          onChange={(value) => editTransforms({ width: Number(value) })}
          options={WIDTH_OPTIONS.map((width) => ({
            value: String(width),
            label: `${width} px`,
          }))}
        />
      </PanelSection>

      <PanelSection title={t('section-export')}>
        <PanelSelectField
          label={t('loop-label')}
          value={String(transforms.loopCount)}
          onChange={(value) => editTransforms({ loopCount: Number(value) })}
          options={[
            { value: '0', label: t('loop-infinite') },
            ...[1, 2, 3].map((n) => ({ value: String(n), label: t('loop-times', { n }) })),
          ]}
        />
        <PanelSwitchField
          label={t('optimize-label')}
          tip={t('optimize-hint')}
          checked={transforms.optimize}
          onChange={(enabled) => editTransforms({ optimize: enabled })}
        />
        <div className="col-span-2 flex flex-col gap-2">
          <Button
            onClick={() => void exportGif()}
            disabled={busy || frames.length === 0 || !budget?.ok}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
            {busy ? t('exporting') : t('export-button')}
          </Button>
          <p className="text-muted-foreground flex items-center gap-1 text-xs">
            <ShieldCheck className="size-3.5" />
            {t('privacy-note')}
          </p>
        </div>
      </PanelSection>
    </PanelGroup>
  )

  return (
    // 与 gif-bg-remover 同理：沉浸页的 main 无 padding，不限宽会让预览帧被放大到发糊
    <div className="mx-auto flex h-full min-h-0 w-full max-w-screen-2xl flex-col pt-(--shell-immersive-inset-top)">
      <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2">
        <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
          <tool.icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          {/* 整页式布局的页面级 h1 由 ToolLayout 以 sr-only 提供，这里降为 h2 避免双 H1 */}
          <h2 className="truncate text-base font-semibold">{t('title')}</h2>
          <p className="text-muted-foreground truncate text-xs">{t('description')}</p>
        </div>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          spacing={0}
          value={mode}
          aria-label={t('mode-label')}
          onValueChange={(value) => {
            if (value) setMode(value as EditorMode)
          }}
        >
          {EDITOR_MODES.map((item) => (
            <ToggleGroupItem key={item} value={item} className="px-3 text-xs">
              {t(`mode-${item}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <FavoriteButton tool={tool} />
        <CopyLinkButton path={tool.path} />
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 pb-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {budget && !budget.ok && (
          <Alert variant="destructive">
            <AlertDescription>
              {t(`budget-${budget.reason}`, { limit: budget.suggestion[budget.reason] })}
            </AlertDescription>
          </Alert>
        )}

        <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
          <div className="flex min-w-0 flex-col gap-4 xl:min-h-0">{workspace}</div>
          <div className="min-w-0">{panel}</div>
        </div>
      </div>

      <AlertDialog open={confirmBoomerang} onOpenChange={setConfirmBoomerang}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('ping-pong-title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('ping-pong-note', { from: frames.length, to: boomerangCount(frames.length) })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => applyToFrames(boomerang(frames))}>
              {t('confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
