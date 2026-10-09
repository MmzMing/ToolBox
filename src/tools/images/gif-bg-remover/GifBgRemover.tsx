import { Download, Loader2, Pause, Play, RotateCcw, Sparkles, Undo2 } from 'lucide-react'
import JSZip from 'jszip'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { CopyLinkButton } from '@/components/copy-link-button'
import { FavoriteButton } from '@/components/favorite-button'
import { FileDropZone } from '@/components/file-drop-zone'
import {
  PanelField,
  PanelGroup,
  PanelSection,
  PanelSelectField,
  PanelSliderField,
  PanelSwitchField,
} from '@/components/panel-fields'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useIsMobile } from '@/composable/use-breakpoint'
import { cn } from '@/lib/utils'
import type { Bounds } from '@/modules/gif/crop'
import type { ColorSeed } from '@/modules/gif/matte'
import type { MatteStroke } from '@/modules/gif/matte-pipeline'
import type { GifDescriptor, RgbaFrame } from '@/modules/gif/types'
import { downloadBlob } from '@/utils/download'
import { formatBytes } from '@/utils/format-bytes'

import {
  canUseAutoEngine,
  CANVAS_TOOLS,
  COLOR_OPTIONS,
  DEFAULT_SETTINGS,
  DITHER_METHODS,
  draftStroke,
  encodeOptions,
  estimateOutputBytes,
  exportName,
  matteOutput,
  matteParams,
  MATTE_SWATCHES,
  OUTPUT_MODES,
  pngFrameName,
  pushSeed,
  removerBudget,
  type RemoverSettings,
  stageScale,
  type StrokeDraft,
  toolStrokeMode,
  type CanvasTool,
} from './gif-bg-remover.service'
import { tool } from './index'
import { useMattePreview, type MatteJob } from './use-matte-preview'

/** 预览帧 → PNG：软 alpha 只有 PNG 装得下，GIF 的 1-bit 透明要留到编码器那一层 */
async function pngBlob(frame: RgbaFrame): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = frame.width
  canvas.height = frame.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('canvas 2d context unavailable')
  context.putImageData(
    new ImageData(new Uint8ClampedArray(frame.rgba), frame.width, frame.height),
    0,
    0,
  )
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('png encode failed'))),
      'image/png',
    )
  })
}

export default function GifBgRemover() {
  const { t } = useTranslation('tools-images', { keyPrefix: 'gif-bg-remover' })
  const isMobile = useIsMobile()
  const {
    ready,
    hasTemporalModel,
    decode,
    openSource,
    refresh,
    pick,
    renderAll,
    exportResult,
    invalidate,
  } = useMattePreview()

  const [meta, setMeta] = useState<GifDescriptor | null>(null)
  const [fileName, setFileName] = useState('animation.gif')
  const [settings, setSettings] = useState<RemoverSettings>(DEFAULT_SETTINGS)
  const [seeds, setSeeds] = useState<ColorSeed[]>([])
  const [strokes, setStrokes] = useState<MatteJob['strokes']>([])
  const [redoStack, setRedoStack] = useState<MatteJob['strokes']>([])
  const [draft, setDraft] = useState<MatteStroke | null>(null)
  const [playhead, setPlayhead] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [pointer, setPointer] = useState<CanvasTool>('pick')
  const [brushRadius, setBrushRadius] = useState(12)
  const [applyToAll, setApplyToAll] = useState(true)
  const [showMask, setShowMask] = useState(false)
  const [frame, setFrame] = useState<RgbaFrame | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [result, setResult] = useState<{ blob: Blob; url: string } | null>(null)
  const [stageBox, setStageBox] = useState<Bounds | null>(null)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const ringRef = useRef<HTMLDivElement>(null)
  const draftRef = useRef<StrokeDraft | null>(null)
  const drawingRef = useRef(false)
  const lastSentRef = useRef(0)

  const budget = meta ? removerBudget(meta, isMobile) : null
  const loaded = Boolean(meta && budget?.ok)
  const scale = frame && stageBox ? stageScale(stageBox, frame, isMobile) : 1
  // 取整显示：小数宽高会让浏览器重采样位图，边缘糊一圈、1px 边框线也对不上
  const shown = frame
    ? {
        width: Math.max(1, Math.floor(frame.width * scale)),
        height: Math.max(1, Math.floor(frame.height * scale)),
      }
    : null
  // 光标环直径 = 半径 × 2 × 显示比例，圈的正是这一笔真正会改到的像素范围；
  // 12px 是可见性下限：缩得很小时真实圈会细到看不见，此时环上的数字仍然报真实半径
  const ringSize =
    shown && frame ? Math.max(12, Math.round(brushRadius * 2 * (shown.width / frame.width))) : 0

  const patch = useCallback((changes: Partial<RemoverSettings>) => {
    setSettings((current) => ({ ...current, ...changes }))
  }, [])

  const job = useMemo<MatteJob>(
    () => ({
      seeds: settings.engine === 'auto' ? [] : seeds,
      params: matteParams(settings),
      // 在途笔画已在指针处理器里换算成 MatteStroke，渲染期不碰 ref
      strokes: draft ? [...strokes, draft] : strokes,
      output: matteOutput(settings),
    }),
    [settings, seeds, strokes, draft],
  )

  // 预览面尺寸只有布局算完才知道，先同步量一次再挂观察器
  useEffect(() => {
    const element = stageRef.current
    if (!element) return
    const read = () => {
      const box = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      // getBoundingClientRect 含 padding：不扣掉就会把内边距当成可用空间，画布会顶破卡片边框
      const padX =
        Number.parseFloat(style.paddingInlineStart) + Number.parseFloat(style.paddingInlineEnd)
      const padY =
        Number.parseFloat(style.paddingBlockStart) + Number.parseFloat(style.paddingBlockEnd)
      setStageBox({
        width: Math.max(1, box.width - padX),
        height: Math.max(1, box.height - padY),
      })
    }
    read()
    const observer = new ResizeObserver(read)
    observer.observe(element)
    return () => observer.disconnect()
  }, [meta])

  useEffect(() => {
    if (!ready || !loaded) return
    let cancelled = false
    // 拖滑块时请求会很密，限流到 ~90ms 一发；worker 那边每次只算一帧
    const wait = Math.max(0, 90 - (performance.now() - lastSentRef.current))
    const timer = window.setTimeout(() => {
      lastSentRef.current = performance.now()
      void refresh(playhead, job)
        .then((next) => {
          if (!cancelled && next) setFrame(next)
        })
        .catch(() => {
          if (!cancelled) setError(t('error-preview'))
        })
    }, wait)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [ready, loaded, playhead, job, refresh, t])

  useEffect(() => {
    if (!playing || !meta || meta.frameCount < 2) return
    const delay = Math.max(1, meta.delaysCs[playhead] ?? 10) * 10
    const timer = window.setTimeout(
      () => setPlayhead((current) => (current + 1) % meta.frameCount),
      delay,
    )
    return () => window.clearTimeout(timer)
  }, [playing, playhead, meta])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !frame) return
    canvas.width = frame.width
    canvas.height = frame.height
    const context = canvas.getContext('2d')
    if (!context) return
    const image = new ImageData(new Uint8ClampedArray(frame.rgba), frame.width, frame.height)
    if (showMask) {
      // 遮罩视图：把 alpha 画成灰阶，用来判断软边到底软不软
      for (let pixel = 0; pixel < frame.width * frame.height; pixel++) {
        const value = frame.rgba[pixel * 4 + 3]
        image.data[pixel * 4] = value
        image.data[pixel * 4 + 1] = value
        image.data[pixel * 4 + 2] = value
        image.data[pixel * 4 + 3] = 255
      }
    }
    context.putImageData(image, 0, 0)
  }, [frame, showMask])

  useEffect(() => {
    return () => {
      if (result) URL.revokeObjectURL(result.url)
    }
  }, [result])

  const handleFiles = useCallback(
    async (files: File[]) => {
      const file = files.find((item) => item.type === 'image/gif' || /\.gif$/i.test(item.name))
      if (!file) {
        setError(t('error-not-gif'))
        return
      }
      setError(null)
      setNotice(null)
      setResult(null)
      setBusy(true)
      try {
        const decoded = await decode(await file.arrayBuffer())
        const verdict = removerBudget(decoded.descriptor, isMobile)
        if (!verdict.ok) {
          setError(t(`budget-${verdict.reason}`, { limit: verdict.suggestion[verdict.reason] }))
          return
        }
        invalidate()
        setMeta(decoded.descriptor)
        setFileName(file.name)
        setSeeds([])
        setStrokes([])
        setRedoStack([])
        setPlayhead(0)
        setFrame(null)
        // 这一步会 transfer 走帧的像素缓冲区，主线程之后不再持有源帧
        await openSource(decoded.frames)
        // 帧数不足取不出中值，自动档会什么都抠不掉；默认档本来就是取色，不必为它弹提示
        if (!canUseAutoEngine(decoded.descriptor.frameCount) && settings.engine !== 'key') {
          patch({ engine: 'key' })
          setNotice(t('notice-short-sequence'))
        }
        setPlaying(true)
      } catch {
        setError(t('error-load'))
      } finally {
        setBusy(false)
      }
    },
    [decode, invalidate, isMobile, openSource, patch, settings.engine, t],
  )

  const toPixel = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current
      if (!canvas || !frame) return null
      const rect = canvas.getBoundingClientRect()
      const x = Math.floor(((event.clientX - rect.left) / rect.width) * frame.width)
      const y = Math.floor(((event.clientY - rect.top) / rect.height) * frame.height)
      if (x < 0 || y < 0 || x >= frame.width || y >= frame.height) return null
      return { x, y }
    },
    [frame],
  )

  /**
   * 笔刷光标环的位置。直接写 DOM 而不是塞进 React 状态：
   * pointermove 每秒能触发上百次，为一个跟随指示器重渲染整块面板不值得。
   */
  const moveRing = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const ring = ringRef.current
    const stage = stageRef.current
    if (!ring || !stage) return
    const box = stage.getBoundingClientRect()
    ring.style.transform = `translate(${event.clientX - box.left}px, ${event.clientY - box.top}px) translate(-50%, -50%)`
  }, [])

  const showRing = useCallback((visible: boolean) => {
    const ring = ringRef.current
    if (ring) ring.style.opacity = visible ? '1' : '0'
  }, [])

  const handlePick = useCallback(
    async (x: number, y: number) => {
      try {
        // 颜色要问 worker 要：预览图上这颗点可能已经被抠成透明了
        const color = await pick(playhead, x, y)
        setSeeds((current) => pushSeed(current, { x, y, color }))
        if (settings.engine === 'auto') patch({ engine: 'both' })
      } catch {
        setError(t('error-pick'))
      }
    },
    [pick, playhead, settings.engine, patch, t],
  )

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      moveRing(event)
      const point = toPixel(event)
      if (!point) return
      if (pointer === 'pick') {
        void handlePick(point.x, point.y)
        return
      }
      setPlaying(false)
      drawingRef.current = true
      draftRef.current = { mode: toolStrokeMode(pointer), points: [point] }
      setDraft(draftStroke(draftRef.current, brushRadius, applyToAll, playhead))
      // 指针捕获只是为了拖出画布也能继续画；没有活跃指针时（合成事件）不能让它打断落笔
      try {
        event.currentTarget.setPointerCapture(event.pointerId)
      } catch {
        // 没有活跃指针（例如脚本合成的 pointer 事件）：靠 pointerup 收尾即可
      }
    },
    [toPixel, moveRing, pointer, handlePick, brushRadius, applyToAll, playhead],
  )

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      moveRing(event)
      if (!drawingRef.current) return
      const point = toPixel(event)
      const current = draftRef.current
      if (!point || !current) return
      const last = current.points[current.points.length - 1]
      if (last && Math.abs(last.x - point.x) < 1 && Math.abs(last.y - point.y) < 1) return
      current.points = [...current.points, point]
      setDraft(draftStroke(current, brushRadius, applyToAll, playhead))
    },
    [toPixel, moveRing, brushRadius, applyToAll, playhead],
  )

  const finishStroke = useCallback(() => {
    drawingRef.current = false
    const current = draftRef.current
    draftRef.current = null
    setDraft(null)
    if (!current || current.points.length === 0) return
    setStrokes((list) => [...list, draftStroke(current, brushRadius, applyToAll, playhead)])
    setRedoStack([])
  }, [brushRadius, applyToAll, playhead])

  const undo = useCallback(() => {
    const last = strokes[strokes.length - 1]
    if (!last) return
    setStrokes(strokes.slice(0, -1))
    setRedoStack([...redoStack, last])
  }, [strokes, redoStack])

  const redo = useCallback(() => {
    const last = redoStack[redoStack.length - 1]
    if (!last) return
    setRedoStack(redoStack.slice(0, -1))
    setStrokes([...strokes, last])
  }, [strokes, redoStack])

  const build = useCallback(async () => {
    if (!meta || !budget?.ok) return
    setBusy(true)
    setError(null)
    setProgress(0)
    try {
      let blob: Blob
      if (settings.output === 'png') {
        const rendered = await renderAll(job, (event) =>
          setProgress(event.total ? (event.done ?? 0) / event.total / 2 : 0),
        )
        const zip = new JSZip()
        for (let index = 0; index < rendered.length; index++) {
          zip.file(pngFrameName(index), await pngBlob(rendered[index]))
          setProgress(0.5 + (index + 1) / rendered.length / 2)
        }
        blob = await zip.generateAsync({ type: 'blob' })
      } else {
        blob = await exportResult(job, encodeOptions(settings, meta), (event) =>
          setProgress(event.total ? (event.done ?? 0) / event.total : 0),
        )
      }
      setResult((previous) => {
        if (previous) URL.revokeObjectURL(previous.url)
        return { blob, url: URL.createObjectURL(blob) }
      })
      setPlaying(false)
    } catch {
      setError(t('error-export'))
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }, [budget, exportResult, job, meta, renderAll, settings, t])

  const workspace = (
    <>
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* 透明网格铺满整个舞台：竖版图按高适配后左右会空出一大片，网格若只画在 canvas 上，
            空档就成了另一种材质，看着像"填充没贴合" */}
        <CardContent
          ref={stageRef}
          className="checkerboard relative flex min-h-0 flex-1 items-center justify-center p-4"
        >
          {frame ? (
            <canvas
              ref={canvasRef}
              className={cn(
                // box-content：Tailwind 默认 border-box 会把 1px 边框算进宽高，图像就被塞进
                // width-2 的内容盒；这条边框现在只用来在网格上标出图像边界
                'box-content border',
                // 画笔态藏掉系统光标，改由下面的尺寸环当光标，两者同时出现反而看不清落点
                pointer === 'pick' ? 'cursor-copy' : 'cursor-none touch-none',
              )}
              style={{ width: shown?.width, height: shown?.height }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={finishStroke}
              onPointerCancel={finishStroke}
              onPointerEnter={(event) => {
                moveRing(event)
                showRing(true)
              }}
              onPointerLeave={() => {
                if (!drawingRef.current) showRing(false)
              }}
            />
          ) : (
            <p className="text-muted-foreground text-sm">{t('empty-hint')}</p>
          )}

          {/* 笔刷尺寸环：直径 = 半径 × 2 × 显示比例，所以圈住的就是这一笔真正会改到的像素范围。
              mix-blend-difference 让它在纯黑与纯白画面上都看得见；位置由指针事件直接写 DOM */}
          {pointer !== 'pick' && (
            <div
              ref={ringRef}
              aria-hidden="true"
              className="pointer-events-none absolute top-0 left-0 flex items-center justify-center rounded-full border border-white text-white opacity-0 mix-blend-difference"
              style={{ width: ringSize, height: ringSize }}
            >
              {ringSize >= 36 && <span className="font-mono text-[10px]">{brushRadius}</span>}
            </div>
          )}
        </CardContent>

        {meta && (
          <div className="flex shrink-0 flex-col gap-2 border-t px-4 py-2">
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={() => setPlaying((value) => !value)}>
                {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
                {t(playing ? 'pause' : 'play')}
              </Button>
              <Slider
                className="min-w-24 flex-1"
                min={0}
                max={Math.max(0, meta.frameCount - 1)}
                step={1}
                value={[playhead]}
                aria-label={t('frame-label')}
                onValueChange={([value]) => {
                  setPlaying(false)
                  setPlayhead(value ?? 0)
                }}
              />
              <Badge variant="secondary" className="shrink-0">
                {playhead + 1} / {meta.frameCount}
              </Badge>
            </div>

            {/* 指针工具与笔刷参数贴着画布放：它们是「看着画面改」的东西，不该藏在右侧折叠区里 */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                spacing={0}
                value={pointer}
                onValueChange={(value) => {
                  if (value) setPointer(value as CanvasTool)
                }}
              >
                {CANVAS_TOOLS.map((item) => (
                  <ToggleGroupItem key={item} value={item} className="px-3 text-xs">
                    {t(`tool-${item}`)}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>

              {pointer !== 'pick' && (
                <>
                  <div className="flex min-w-40 flex-1 items-center gap-2">
                    <span className="text-muted-foreground shrink-0 text-xs">
                      {t('radius-label')}
                    </span>
                    <Slider
                      className="min-w-16 flex-1"
                      min={2}
                      max={64}
                      step={1}
                      value={[brushRadius]}
                      aria-label={t('radius-label')}
                      onValueChange={([value]) => setBrushRadius(value ?? 12)}
                    />
                    <span className="w-6 shrink-0 text-right font-mono text-xs">{brushRadius}</span>
                  </div>
                  {/* 笔迹作用域贴着画笔放：它只决定这一笔记在哪几帧上 */}
                  <label className="flex shrink-0 items-center gap-2 text-xs">
                    <Switch checked={applyToAll} onCheckedChange={setApplyToAll} />
                    {t('apply-all-label')}
                  </label>
                </>
              )}

              <div className="ml-auto flex items-center gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  disabled={strokes.length === 0}
                  onClick={undo}
                  aria-label={t('undo')}
                >
                  <Undo2 className="size-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  disabled={redoStack.length === 0}
                  onClick={redo}
                  aria-label={t('redo')}
                >
                  <RotateCcw className="size-4" />
                </Button>
                <span className="text-muted-foreground px-1 text-xs">
                  {t('strokes-count', { n: strokes.length })}
                </span>
                <Button
                  size="sm"
                  variant={showMask ? 'secondary' : 'ghost'}
                  onClick={() => setShowMask((value) => !value)}
                >
                  {t('mask-view')}
                </Button>
              </div>
            </div>
          </div>
        )}
      </Card>

      {result && (
        <Card className="shrink-0">
          <CardHeader>
            <CardTitle className="text-base">
              {t('result-title')} · {formatBytes(result.blob.size)}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-4">
            {settings.output === 'png' ? (
              <p className="text-muted-foreground text-sm">
                {t('note-png', { n: meta?.frameCount ?? 0 })}
              </p>
            ) : (
              <img src={result.url} alt="" className="checkerboard max-h-32 rounded-md border" />
            )}
            <Button
              variant="outline"
              onClick={() => downloadBlob(result.blob, exportName(fileName, settings))}
            >
              <Download className="size-4" />
              {t('download-button')}
            </Button>
          </CardContent>
        </Card>
      )}
    </>
  )

  const panel = (
    <PanelGroup>
      <PanelSection title={t('section-output')}>
        <PanelSelectField
          label={t('output-label')}
          value={settings.output}
          onChange={(value) => patch({ output: value as RemoverSettings['output'] })}
          options={OUTPUT_MODES.map((id) => ({ value: id, label: t(`output-${id}`) }))}
          tip={t('output-tip')}
          span={2}
        />
        {settings.output === 'matte' && (
          <PanelField label={t('matte-color-label')} span={2} tip={t('matte-color-tip')}>
            <div className="flex items-center gap-2">
              {/* 推荐组：表情与贴纸基本落在这四档上，点一下就换，不用先想色值 */}
              <div className="flex shrink-0 items-center gap-1.5">
                {MATTE_SWATCHES.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    aria-label={hex}
                    onClick={() => patch({ matteColor: hex })}
                    className={cn(
                      'size-7 rounded-md border',
                      settings.matteColor.toLowerCase() === hex && 'ring-primary ring-2',
                    )}
                    style={{ backgroundColor: hex }}
                  />
                ))}
              </div>
              <span className="bg-border h-6 w-px shrink-0" aria-hidden="true" />
              {/* 右侧自选色：色值只读展示，改色交给原生取色器，省掉手打十六进制出错这条路 */}
              <label className="flex min-w-0 flex-1 items-center gap-2">
                <input
                  type="color"
                  value={
                    /^#[0-9a-f]{6}$/i.test(settings.matteColor) ? settings.matteColor : '#ffffff'
                  }
                  aria-label={t('matte-color-custom')}
                  onChange={(event) => patch({ matteColor: event.target.value })}
                  className="bg-background size-7 shrink-0 cursor-pointer rounded-md border p-0.5"
                />
                <span className="text-muted-foreground truncate font-mono text-xs">
                  {t('matte-color-custom')} {settings.matteColor}
                </span>
              </label>
            </div>
          </PanelField>
        )}
        {(settings.output === 'transparent' || settings.output === 'dither') && (
          <PanelSliderField
            label={t('binary-threshold')}
            value={settings.binaryThreshold}
            min={0}
            max={254}
            onChange={(value) => patch({ binaryThreshold: value })}
            span={2}
          />
        )}
        {settings.output === 'dither' && (
          <PanelSelectField
            label={t('dither-label')}
            value={settings.dither}
            onChange={(value) => patch({ dither: value as RemoverSettings['dither'] })}
            options={DITHER_METHODS.map((method) => ({
              value: method,
              label: t(`dither-${method}`),
            }))}
            tip={t('dither-tip')}
            span={2}
          />
        )}
        {settings.output !== 'png' && (
          <PanelSelectField
            label={t('colors-label')}
            value={String(settings.colors)}
            onChange={(value) => patch({ colors: Number(value) })}
            options={COLOR_OPTIONS.map((colors) => ({
              value: String(colors),
              label: String(colors),
            }))}
            span={2}
          />
        )}
        <PanelField
          label={t('export-label')}
          span={2}
          hint={meta ? t('size-hint', { size: formatBytes(estimateOutputBytes(meta)) }) : undefined}
        >
          <div className="flex flex-col gap-2">
            {progress !== null && <Progress value={Math.round(progress * 100)} />}
            <Button disabled={!loaded || busy} onClick={() => void build()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {t(settings.output === 'png' ? 'export-png-button' : 'export-button')}
            </Button>
          </div>
        </PanelField>
      </PanelSection>

      <PanelSection title={t('section-matte')}>
        <PanelSelectField
          label={t('engine-label')}
          value={settings.engine}
          onChange={(value) => patch({ engine: value as RemoverSettings['engine'] })}
          options={(['auto', 'key', 'both'] as const).map((id) => ({
            value: id,
            label: t(`engine-${id}`),
          }))}
          tip={t('engine-tip')}
          hint={hasTemporalModel ? undefined : t('notice-no-model')}
          span={2}
        />
        <PanelField
          label={t('seeds-label')}
          span={2}
          hint={seeds.length > 0 ? t('seeds-hint', { n: seeds.length }) : t('no-seeds')}
        >
          <div className="flex flex-wrap items-center gap-2">
            {seeds.map((seed, index) => (
              <button
                key={`${seed.x}-${seed.y}-${index}`}
                type="button"
                className="size-6 rounded-full border"
                style={{ backgroundColor: `rgb(${(seed.color ?? [0, 0, 0]).join(',')})` }}
                title={t('seed-remove')}
                onClick={() => setSeeds(seeds.filter((_, position) => position !== index))}
              />
            ))}
            {seeds.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-xs"
                onClick={() => setSeeds([])}
              >
                <RotateCcw className="size-3.5" />
                {t('clear-seeds')}
              </Button>
            )}
          </div>
        </PanelField>
        {settings.engine !== 'key' && (
          <>
            <PanelSliderField
              label={t('threshold-label')}
              value={settings.threshold}
              min={0}
              max={255}
              onChange={(value) => patch({ threshold: value })}
            />
            <PanelSliderField
              label={t('ramp-label')}
              value={settings.ramp}
              min={8}
              max={255}
              onChange={(value) => patch({ ramp: value })}
            />
          </>
        )}
        {settings.engine !== 'auto' && (
          <>
            <PanelSliderField
              label={t('tolerance-label')}
              value={settings.tolerance}
              min={0}
              max={80}
              onChange={(value) => patch({ tolerance: value })}
            />
            <PanelSliderField
              label={t('key-ramp-label')}
              value={settings.keyRamp}
              min={1}
              max={80}
              onChange={(value) => patch({ keyRamp: value })}
            />
            <PanelSwitchField
              label={t('connected-label')}
              checked={settings.connected}
              onChange={(value) => patch({ connected: value })}
              tip={t('connected-tip')}
              span={2}
            />
          </>
        )}
      </PanelSection>

      <PanelSection title={t('section-refine')} defaultOpen={false}>
        <PanelSliderField
          label={t('morph-label')}
          value={settings.morph}
          min={0}
          max={3}
          onChange={(value) => patch({ morph: value })}
        />
        <PanelSliderField
          label={t('edge-label')}
          value={settings.edge}
          min={-3}
          max={3}
          onChange={(value) => patch({ edge: value })}
        />
        <PanelSliderField
          label={t('feather-label')}
          value={settings.feather}
          min={0}
          max={6}
          onChange={(value) => patch({ feather: value })}
        />
        <PanelSliderField
          label={t('temporal-label')}
          value={settings.temporal}
          min={0}
          max={3}
          onChange={(value) => patch({ temporal: value })}
          tip={t('temporal-tip')}
        />
        <PanelSliderField
          label={t('despill-label')}
          value={settings.despill}
          min={0}
          max={100}
          onChange={(value) => patch({ despill: value })}
        />
        <PanelSwitchField
          label={t('guided-label')}
          checked={settings.guided}
          onChange={(value) => patch({ guided: value })}
          tip={t('guided-tip')}
        />
        <PanelSwitchField
          label={t('decontaminate-label')}
          checked={settings.decontaminate}
          onChange={(value) => patch({ decontaminate: value })}
          tip={t('decontaminate-tip')}
        />
        {settings.engine === 'both' && (
          <PanelSelectField
            label={t('combine-label')}
            value={settings.combine}
            onChange={(value) => patch({ combine: value as RemoverSettings['combine'] })}
            options={(['min', 'max'] as const).map((id) => ({
              value: id,
              label: t(`combine-${id}`),
            }))}
            tip={t('combine-tip')}
            span={2}
          />
        )}
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
        {notice && (
          <Alert>
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        )}

        {!meta ? (
          <FileDropZone
            accept="image/gif,.gif"
            title={t('drop-title')}
            subtitle={t('drop-subtitle')}
            browseLabel={t('choose-file')}
            pasteHint={t('paste-hint')}
            icon={Sparkles}
            minHeightClass="min-h-[360px]"
            onFiles={(files) => void handleFiles(files)}
          />
        ) : (
          <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
            <div className="flex min-w-0 flex-col gap-4 xl:min-h-0">{workspace}</div>
            <div className="min-w-0">{panel}</div>
          </div>
        )}
      </div>
    </div>
  )
}
