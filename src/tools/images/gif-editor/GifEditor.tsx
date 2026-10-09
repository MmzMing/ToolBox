import {
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Images,
  Loader2,
  Package,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  SquareDashed,
  Trash2,
  Wand2,
  X,
} from 'lucide-react'
import JSZip from 'jszip'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { FileDropZone } from '@/components/file-drop-zone'
import { CopyLinkButton } from '@/components/copy-link-button'
import { FavoriteButton } from '@/components/favorite-button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
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
import { useIsMobile } from '@/composable/use-breakpoint'
import { centerCrop, clampRect } from '@/modules/gif/crop'
import { SPEED_STEPS, csToSeconds, secondsOf, secondsToCs } from '@/modules/gif/speed'
import { frameToImageData, resizeImage, type RotateDegrees } from '@/modules/gif/transform'
import type { GifDescriptor, RgbaFrame } from '@/modules/gif/types'
import { useGifWorker } from '@/modules/gif/worker/use-gif-worker'
import { boomerang, deleteAt, duplicateAt, moveItem, reverseItems } from '@/utils/array-ops'
import { cn } from '@/lib/utils'
import { downloadBlob } from '@/utils/download'
import { formatBytes } from '@/utils/format-bytes'

import { CropOverlay } from './crop-overlay'
import { FrameThumb } from './frame-thumb'
import {
  CROP_RATIOS,
  type EditorTransforms,
  FLIPS,
  type Flip,
  editorBudget,
  exportSize,
  frameDelays,
  loadPercent,
  type LoadPhase,
  pngFrameName,
  ROTATIONS,
  WIDTH_OPTIONS,
} from './gif-editor.service'
import { tool } from './index'
import { applyEditorTransforms, rotatedBounds, useFramePlayer } from './use-frame-player'

const DEFAULT_TRANSFORMS: EditorTransforms = {
  rotate: 0,
  flip: 'none',
  crop: null,
  speed: 1,
  width: 320,
  loopCount: 0,
  optimize: true,
}

/** 逐帧编辑器：上预览、中播放与进度条、下缩略图卡片，卡片点击即跳转 */
export default function GifEditor() {
  const { t } = useTranslation('tools-images', { keyPrefix: 'gif-editor' })
  const isMobile = useIsMobile()
  const { decode, encode, optimize } = useGifWorker()
  const mergeRef = useRef<HTMLInputElement>(null)
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
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ blob: Blob; url: string } | null>(null)
  const [stageBox, setStageBox] = useState<{ width: number; height: number } | null>(null)
  const [loading, setLoading] = useState<{ phase: LoadPhase; total: number } | null>(null)

  useEffect(() => {
    if (!result) return
    return () => URL.revokeObjectURL(result.url)
  }, [result])

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
  const size = meta ? exportSize(meta, transforms) : null
  const delays = useMemo(() => frameDelays(frames, transforms.speed), [frames, transforms.speed])
  const budget = size ? editorBudget(delays.delaysCs, size, isMobile) : null
  const crop = transforms.crop && bounds ? clampRect(transforms.crop, bounds) : null
  const ratio = CROP_RATIOS.find((item) => item.id === ratioId)?.ratio ?? null
  // 预览按可用空间等比缩放：小图放大看清单帧，大图缩小以免顶破版面
  const previewScale =
    !size || !stageBox
      ? 1
      : Math.min(
          Math.max(
            Math.min((stageBox.width - 24) / size.width, (stageBox.height - 24) / size.height),
            0.1,
          ),
          4,
        )

  const signature = [
    transforms.rotate,
    transforms.flip,
    crop ? `${crop.x},${crop.y},${crop.width},${crop.height}` : 'full',
    size ? `${size.width}x${size.height}` : 'none',
    frames.length,
  ].join('|')

  const { playing, playhead, toggle, seek } = useFramePlayer({
    canvasRef: previewRef,
    frames,
    delaysCs: delays.delaysCs,
    transforms: { ...transforms, crop },
    size,
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
      setResult(null)
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
      } catch {
        setError(t('error-invalid'))
      } finally {
        setLoading(null)
      }
    },
    [decode, t],
  )

  const applyToFrames = (next: RgbaFrame[]) => {
    setFrames(next)
    setChecked(new Set())
  }

  const mergeAnother = useCallback(
    async (file: File) => {
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
    },
    [decode, frames, t],
  )

  const setRatio = (id: string) => {
    setRatioId(id)
    const picked = CROP_RATIOS.find((item) => item.id === id)?.ratio
    setTransforms((current) => ({
      ...current,
      crop: picked && bounds ? clampRect(centerCrop(bounds, picked), bounds) : null,
    }))
  }

  async function exportGif() {
    if (!size || frames.length === 0) return
    setBusy(true)
    setError(null)
    try {
      const prepared = frames.map((frame, index) => ({
        ...applyEditorTransforms(frame, { ...transforms, crop }, size),
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
      setResult((previous) => {
        if (previous) URL.revokeObjectURL(previous.url)
        return { blob, url: URL.createObjectURL(blob) }
      })
    } catch {
      setError(t('error-export'))
    } finally {
      setBusy(false)
    }
  }

  async function exportFrames() {
    if (frames.length === 0) return
    setBusy(true)
    setError(null)
    try {
      const zip = new JSZip()
      const base = fileName.replace(/\.gif$/i, '') || 'frames'
      for (const [index, frame] of frames.entries()) {
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
  ) : !meta || !bounds || !size ? (
    <FileDropZone
      accept="image/gif,.gif"
      title={t('drop-title')}
      subtitle={t('drop-subtitle')}
      browseLabel={t('browse')}
      pasteHint={t('paste-hint')}
      icon={Images}
      minHeightClass="min-h-[360px]"
      onFiles={(files) => void loadFile(files[0])}
    />
  ) : (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {/* 第一层：预览画布，水平垂直都居中；与缩略图矩阵按 3:2 分剩余高度 */}
      <div
        ref={boxRef}
        className="bg-muted/30 flex min-h-[220px] flex-[3_1_0%] items-center justify-center overflow-hidden rounded-lg border"
      >
        <div ref={stageRef} className="relative">
          <canvas
            ref={previewRef}
            className="block"
            style={{
              width: size.width * previewScale,
              height: size.height * previewScale,
            }}
          />
          {crop && (
            <CropOverlay
              stageRef={stageRef}
              rect={crop}
              bounds={bounds}
              ratio={ratio}
              onChange={(next) => setTransforms((current) => ({ ...current, crop: next }))}
            />
          )}
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

      <p className="text-muted-foreground shrink-0 text-xs">
        {t('preview-note', {
          width: size.width,
          height: size.height,
          frames: frames.length,
          seconds: secondsOf(delays.delaysCs).toFixed(1),
        })}
      </p>

      {/* 第三层：缩略图矩阵，自动换行并纵向滚动，点击跳转 */}
      <div
        ref={stripRef}
        className="relative grid min-h-[140px] flex-[2_1_0%] auto-rows-min grid-cols-[repeat(auto-fill,minmax(96px,1fr))] content-start gap-2 overflow-y-auto pr-1"
      >
        {frames.map((frame, index) => (
          <div
            key={index}
            data-frame-index={index}
            className={cn(
              'bg-muted/40 flex min-w-0 flex-col gap-1 rounded-lg border p-1.5',
              playhead === index && 'border-primary',
            )}
          >
            <button
              type="button"
              onClick={() => seek(index)}
              className="bg-background flex h-20 items-center justify-center overflow-hidden rounded"
              aria-label={t('jump-to', { n: index + 1 })}
            >
              <FrameThumb frame={frame} size={76} />
            </button>
            <div className="flex items-center gap-1">
              <input
                type="checkbox"
                className="accent-primary size-3.5"
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
              <span className="text-muted-foreground text-xs">{index + 1}</span>
              <Input
                value={csToSeconds(frame.delayCs)}
                inputMode="decimal"
                className="h-6 w-12 px-1 text-[11px]"
                aria-label={t('delay-label')}
                onChange={(event) => {
                  const raw = Number(event.target.value)
                  const cs = Number.isFinite(raw) && raw > 0 ? secondsToCs(raw) : frame.delayCs
                  setFrames(
                    frames.map((item, position) =>
                      position === index ? { ...item, delayCs: cs } : item,
                    ),
                  )
                }}
              />
            </div>
            <div className="flex items-center gap-0.5">
              <Button
                size="icon"
                variant="ghost"
                className="size-6"
                disabled={index === 0}
                onClick={() => applyToFrames(moveItem(frames, index, index - 1))}
                aria-label={t('move-up')}
              >
                <ChevronUp className="size-3" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-6"
                disabled={index === frames.length - 1}
                onClick={() => applyToFrames(moveItem(frames, index, index + 1))}
                aria-label={t('move-down')}
              >
                <ChevronDown className="size-3" />
              </Button>
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
          </div>
        ))}
      </div>

      {result && (
        <Card className="shrink-0">
          <CardHeader>
            <CardTitle className="text-base">
              {t('result-title')} · {formatBytes(result.blob.size)}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-4">
            <img src={result.url} alt="" className="max-h-40 rounded-md border" />
            <Button
              variant="outline"
              onClick={() =>
                downloadBlob(result.blob, `${fileName.replace(/\.gif$/i, '')}-edited.gif`)
              }
            >
              <Download className="size-4" />
              {t('download-button')}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )

  const panel = (
    <PanelGroup>
      <PanelSection title={t('section-frames')}>
        <Badge variant="secondary" className="col-span-2 w-fit">
          {frames.length} {t('frames-unit')} · {secondsOf(delays.delaysCs).toFixed(1)}s
        </Badge>
        <Button size="sm" variant="outline" onClick={() => applyToFrames(reverseItems(frames))}>
          <RotateCcw className="size-4" />
          {t('reverse')}
        </Button>
        <Button size="sm" variant="outline" onClick={() => applyToFrames(boomerang(frames))}>
          {t('ping-pong')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="col-span-2"
          disabled={checked.size === 0}
          onClick={() => applyToFrames(deleteAt(frames, [...checked]))}
        >
          <Trash2 className="size-4" />
          {t('delete-selected', { n: checked.size })}
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
        <Button size="sm" variant="outline" onClick={() => mergeRef.current?.click()}>
          {t('merge')}
        </Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void exportFrames()}>
          <Package className="size-4" />
          {t('extract')}
        </Button>
      </PanelSection>

      <PanelSection title={t('section-transform')}>
        <PanelField span={2} label={t('ratio-label')}>
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
            {crop && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
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
          onChange={(value) => setTransforms({ ...transforms, speed: Number(value) })}
          options={SPEED_STEPS.map((step) => ({
            value: String(step),
            label: t('speed-times', { n: step }),
          }))}
          hint={delays.clamped > 0 ? t('speed-clamped', { n: delays.clamped }) : undefined}
        />
        <PanelSelectField
          label={t('rotate-label')}
          value={String(transforms.rotate)}
          onChange={(value) =>
            setTransforms({ ...transforms, rotate: Number(value) as RotateDegrees })
          }
          options={ROTATIONS.map((degrees) => ({
            value: String(degrees),
            label: `${degrees}°`,
          }))}
        />
        <PanelSelectField
          label={t('flip-label')}
          value={transforms.flip}
          onChange={(value) => setTransforms({ ...transforms, flip: value as Flip })}
          options={FLIPS.map((flip) => ({ value: flip, label: t(`flip-${flip}`) }))}
        />
        <PanelSelectField
          label={t('width-label')}
          tip={t('width-hint')}
          value={String(transforms.width)}
          onChange={(value) => setTransforms({ ...transforms, width: Number(value) })}
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
          onChange={(value) => setTransforms({ ...transforms, loopCount: Number(value) })}
          options={[
            { value: '0', label: t('loop-infinite') },
            ...[1, 2, 3].map((n) => ({ value: String(n), label: t('loop-times', { n }) })),
          ]}
        />
        <PanelSwitchField
          label={t('optimize-label')}
          tip={t('optimize-hint')}
          checked={transforms.optimize}
          onChange={(enabled) => setTransforms({ ...transforms, optimize: enabled })}
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
    <div className="flex h-full min-h-0 flex-col pt-(--shell-immersive-inset-top)">
      <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2">
        <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
          <tool.icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          {/* 整页式布局的页面级 h1 由 ToolLayout 以 sr-only 提供，这里降为 h2 避免双 H1 */}
          <h2 className="truncate text-base font-semibold">{t('title')}</h2>
          <p className="text-muted-foreground truncate text-xs">{t('description')}</p>
        </div>
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
    </div>
  )
}
