import {
  ArrowDown,
  ArrowUp,
  GripVertical,
  Images,
  Loader2,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { FileAddButtons, FileDropZone } from '@/components/file-drop-zone'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  PanelField,
  PanelGroup,
  PanelRadioField,
  PanelSection,
  PanelSelectField,
  PanelSwitchField,
} from '@/components/panel-fields'
import { Progress } from '@/components/ui/progress'
import { useIsMobile } from '@/composable/use-breakpoint'
import { cn } from '@/lib/utils'
import type { FillMode } from '@/modules/gif/crop'
import { framesFromFiles, type MatteColor } from '@/modules/gif/image-frames'
import { shrinkToTarget } from '@/modules/gif/shrink'
import { csToSeconds, secondsToCs } from '@/modules/gif/speed'
import { PLATFORM_TARGETS } from '@/modules/gif/targets'
import type { RgbaFrame } from '@/modules/gif/types'
import { useGifWorker } from '@/modules/gif/worker/use-gif-worker'
import { moveItem, reverseItems } from '@/utils/array-ops'
import { downloadBlob } from '@/utils/download'
import { formatBytes } from '@/utils/format-bytes'

import {
  ASPECTS,
  type AspectId,
  canvasOf,
  COLOR_OPTIONS,
  DEFAULT_SETTINGS,
  delaysFor,
  estimateBytes,
  FILL_MODES,
  fpsToDelayCs,
  FPS_OPTIONS,
  imageFilesOnly,
  type MakerSettings,
  makerBudget,
  MATTE_OPTIONS,
  MIN_FRAMES,
  rejectedFileCount,
  targetBytesFor,
  WIDTH_OPTIONS,
} from './gif-maker.service'

type FrameItem = { id: number; file: File; url: string; width: number; height: number }

let nextId = 1

/** 多图合成 GIF：卡片拖拽排序 + 逐帧延时（秒）+ 锁定画布比例与填充方式，可选压到目标体积。 */
export default function GifMaker() {
  const { t } = useTranslation('tools-images', { keyPrefix: 'gif-maker' })
  const isMobile = useIsMobile()
  const { encode, optimize } = useGifWorker()

  const [items, setItems] = useState<FrameItem[]>([])
  const [overrides, setOverrides] = useState<(number | null)[]>([])
  const [settings, setSettings] = useState<MakerSettings>(DEFAULT_SETTINGS)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [result, setResult] = useState<{ blob: Blob; url: string; note: string } | null>(null)
  const [drag, setDrag] = useState<{ from: number; over: number } | null>(null)

  useEffect(() => {
    if (!result) return
    return () => URL.revokeObjectURL(result.url)
  }, [result])

  const delayCs = fpsToDelayCs(settings.fps)
  const canvas = items.length > 0 ? canvasOf(items[0], settings) : null
  const budget = canvas ? makerBudget(items.length, canvas, delayCs, isMobile) : null
  const estimate = canvas ? estimateBytes(items.length, canvas) : 0

  const addFiles = useCallback(
    async (files: File[]) => {
      const kept = imageFilesOnly(files)
      const dropped = rejectedFileCount(files, kept)
      setNotice(dropped > 0 ? t('rejected-note', { n: dropped }) : null)
      if (kept.length === 0) return

      const loaded: FrameItem[] = []
      for (const file of kept) {
        try {
          const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
          loaded.push({
            id: nextId++,
            file,
            url: URL.createObjectURL(file),
            width: bitmap.width,
            height: bitmap.height,
          })
          bitmap.close()
        } catch {
          setNotice(t('rejected-note', { n: dropped + 1 }))
        }
      }
      setItems((current) => [...current, ...loaded])
      setOverrides((current) => [...current, ...loaded.map(() => null)])
    },
    [t],
  )

  const removeAt = (index: number) => {
    const removed = items[index]
    if (removed) URL.revokeObjectURL(removed.url)
    setItems(items.filter((_, position) => position !== index))
    setOverrides(overrides.filter((_, position) => position !== index))
  }

  const reorder = (from: number, to: number) => {
    if (from === to) return
    setItems(moveItem(items, from, to))
    setOverrides(moveItem(overrides, from, to))
  }

  const onGridPointerMove = (event: React.PointerEvent) => {
    if (!drag) return
    const hit = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest('[data-frame-index]') as HTMLElement | null
    const over = Number(hit?.dataset.frameIndex)
    if (Number.isInteger(over) && over !== drag.over) setDrag({ ...drag, over })
  }

  const build = async () => {
    if (!canvas || items.length < MIN_FRAMES) return
    setBusy(true)
    setError(null)
    setProgress(0)
    try {
      const delays = delaysFor(items.length, delayCs, overrides)
      const frames: RgbaFrame[] = await framesFromFiles(
        items.map((item) => item.file),
        canvas,
        delays,
        settings.matte,
        settings.fill,
        setProgress,
      )
      let blob = await encode(frames, {
        maxColors: settings.colors,
        loopCount: settings.loopCount,
        delayCs,
      })
      let note = t('note-encoded', { width: canvas.width, height: canvas.height })

      const targetBytes = targetBytesFor(settings)
      if (targetBytes !== null) {
        const outcome = await shrinkToTarget({
          bytes: await blob.arrayBuffer(),
          source: canvas,
          targetBytes,
          start: { width: canvas.width, fps: settings.fps, maxColors: settings.colors, lossy: 0 },
          optimize,
        })
        blob = outcome.blob
        note = t('note-searched', {
          width: outcome.params.width,
          colors: outcome.params.maxColors,
          lossy: outcome.params.lossy,
          rounds: outcome.rounds,
          fit: outcome.ok ? t('badge-pass') : t('badge-fail'),
        })
      } else if (settings.optimize || settings.dither) {
        blob = await optimize(await blob.arrayBuffer(), {
          optimizeLevel: 3,
          maxColors: settings.colors,
          dither: settings.dither,
        })
        note = t('note-optimized', { colors: settings.colors })
      }

      setResult((previous) => {
        if (previous) URL.revokeObjectURL(previous.url)
        return { blob, url: URL.createObjectURL(blob), note }
      })
    } catch {
      setError(t('error-build'))
    } finally {
      setBusy(false)
    }
  }

  const workspace =
    items.length === 0 || !canvas ? (
      <FileDropZone
        accept="image/*"
        multiple
        allowFolder
        title={t('drop-title')}
        subtitle={t('drop-subtitle')}
        browseLabel={t('browse')}
        folderLabel={t('browse-folder')}
        pasteHint={t('paste-hint')}
        icon={Images}
        onFiles={(files) => void addFiles(files)}
      />
    ) : (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <FileAddButtons
            accept="image/*"
            multiple
            allowFolder
            browseLabel={t('add-more')}
            folderLabel={t('browse-folder')}
            onFiles={(files) => void addFiles(files)}
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setItems(reverseItems(items))
              setOverrides(reverseItems(overrides))
            }}
          >
            <RotateCcw className="size-4" />
            {t('reverse')}
          </Button>
          <span className="text-muted-foreground text-xs">
            {t('canvas-size', { width: canvas.width, height: canvas.height })}
          </span>
        </div>

        <div
          onPointerMove={onGridPointerMove}
          onPointerUp={() => {
            if (drag) reorder(drag.from, drag.over)
            setDrag(null)
          }}
          onPointerCancel={() => setDrag(null)}
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4"
        >
          {items.map((item, index) => (
            <figure
              key={item.id}
              data-frame-index={index}
              className={cn(
                'bg-muted/40 flex flex-col gap-2 rounded-lg border p-2',
                drag && drag.over === index && drag.from !== index && 'border-primary',
                drag?.from === index && 'opacity-50',
              )}
            >
              <div className="relative">
                <img
                  src={item.url}
                  alt=""
                  className="bg-background aspect-square w-full rounded-md object-contain"
                />
                <span className="bg-background/80 absolute top-1 left-1 rounded px-1.5 text-xs">
                  {index + 1}
                </span>
                <span
                  onPointerDown={() => setDrag({ from: index, over: index })}
                  className="bg-background/80 absolute top-1 right-1 cursor-grab touch-none rounded p-1 active:cursor-grabbing"
                  aria-label={t('drag-hint')}
                >
                  <GripVertical className="size-3.5" />
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Input
                  value={csToSeconds(overrides[index] ?? delayCs)}
                  inputMode="decimal"
                  className="h-7 w-14 px-1 text-xs"
                  aria-label={t('delay-label')}
                  onChange={(event) => {
                    const raw = Number(event.target.value)
                    const next = [...overrides]
                    next[index] = Number.isFinite(raw) && raw > 0 ? secondsToCs(raw) : null
                    setOverrides(next)
                  }}
                />
                <span className="text-muted-foreground text-xs">{t('seconds-unit')}</span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="ml-auto size-7"
                  disabled={index === 0}
                  onClick={() => reorder(index, index - 1)}
                  aria-label={t('move-up')}
                >
                  <ArrowUp className="size-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  disabled={index === items.length - 1}
                  onClick={() => reorder(index, index + 1)}
                  aria-label={t('move-down')}
                >
                  <ArrowDown className="size-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  onClick={() => removeAt(index)}
                  aria-label={t('remove')}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </figure>
          ))}
        </div>

        {result && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {t('result-title')} · {formatBytes(result.blob.size)}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-end gap-4">
              <img src={result.url} alt="" className="max-h-72 rounded-md border" />
              <div className="flex flex-col gap-2">
                <p className="text-muted-foreground text-xs">{result.note}</p>
                <Button
                  variant="outline"
                  onClick={() => downloadBlob(result.blob, 'animation.gif')}
                >
                  {t('download-button')}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    )

  const panel = (
    <div className="flex flex-col gap-4">
      <PanelGroup>
        <PanelSection title={t('section-canvas')}>
          <PanelSelectField
            label={t('width-label')}
            value={String(settings.width)}
            onChange={(value) => setSettings({ ...settings, width: Number(value) })}
            options={WIDTH_OPTIONS.map((width) => ({
              value: String(width),
              label: `${width} px`,
            }))}
          />
          <PanelSelectField
            label={t('fps-label')}
            value={String(settings.fps)}
            onChange={(value) => setSettings({ ...settings, fps: Number(value) })}
            options={FPS_OPTIONS.map((fps) => ({ value: String(fps), label: `${fps} fps` }))}
          />
          <PanelSelectField
            label={t('aspect-label')}
            value={settings.aspect}
            onChange={(value) => setSettings({ ...settings, aspect: value as AspectId })}
            options={ASPECTS.map((aspect) => ({
              value: aspect.id,
              label: t(`aspect-${aspect.id}`),
            }))}
          />
          <PanelSelectField
            label={t('matte-label')}
            value={settings.matte}
            onChange={(value) => setSettings({ ...settings, matte: value as MatteColor })}
            options={MATTE_OPTIONS.map((matte) => ({
              value: matte,
              label: t(`matte-${matte}`),
            }))}
          />
          <PanelRadioField
            label={t('fill-label')}
            tip={t('fill-hint')}
            value={settings.fill}
            onChange={(value) => setSettings({ ...settings, fill: value as FillMode })}
            options={FILL_MODES.map((mode) => ({ value: mode, label: t(`fill-${mode}`) }))}
          />
        </PanelSection>

        <PanelSection title={t('section-quality')}>
          <PanelSelectField
            label={t('colors-label')}
            value={String(settings.colors)}
            onChange={(value) => setSettings({ ...settings, colors: Number(value) })}
            options={COLOR_OPTIONS.map((colors) => ({
              value: String(colors),
              label: String(colors),
            }))}
          />
          <PanelSwitchField
            label={t('dither-label')}
            tip={t('dither-hint')}
            checked={settings.dither}
            onChange={(checked) => setSettings({ ...settings, dither: checked })}
          />
          <PanelSwitchField
            span={2}
            label={t('optimize-label')}
            tip={t('optimize-hint')}
            checked={settings.optimize}
            onChange={(checked) => setSettings({ ...settings, optimize: checked })}
          />
        </PanelSection>

        <PanelSection title={t('section-target')}>
          <PanelSelectField
            span={2}
            label={t('target-label')}
            tip={t('target-hint')}
            value={settings.target}
            onChange={(value) => setSettings({ ...settings, target: value })}
            options={[
              { value: 'off', label: t('target-off') },
              ...PLATFORM_TARGETS.map((target) => ({
                value: target.id,
                label: `${target.label} · ${formatBytes(target.maxBytes)}`,
              })),
              { value: 'custom', label: t('target-custom') },
            ]}
          />
          {settings.target === 'custom' && (
            <PanelField span={2} label={t('custom-kb-label')}>
              <Input
                type="number"
                min={1}
                value={settings.customKb}
                onChange={(event) =>
                  setSettings({ ...settings, customKb: Number(event.target.value) })
                }
              />
            </PanelField>
          )}
        </PanelSection>

        <PanelSection title={t('section-loop')}>
          <PanelSelectField
            label={t('loop-label')}
            value={String(settings.loopCount)}
            onChange={(value) => setSettings({ ...settings, loopCount: Number(value) })}
            options={[
              { value: '0', label: t('loop-infinite') },
              ...[1, 2, 3, 5].map((n) => ({ value: String(n), label: t('loop-times', { n }) })),
            ]}
          />
        </PanelSection>
      </PanelGroup>

      <Card>
        <CardContent className="flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">
              {items.length} {t('frames-unit')}
            </Badge>
            {canvas && (
              <Badge variant="outline">{t('estimate-size', { size: formatBytes(estimate) })}</Badge>
            )}
          </div>
          <Button
            onClick={() => void build()}
            disabled={busy || items.length < MIN_FRAMES || !budget?.ok}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {busy ? `${t('building')} ${progress}/${items.length}` : t('build-button')}
          </Button>
          {busy && items.length > 0 && (
            <Progress value={(progress / items.length) * 100} aria-label={t('building')} />
          )}
          {items.length > 0 && items.length < MIN_FRAMES && (
            <p className="text-muted-foreground text-xs">{t('need-more')}</p>
          )}
          <p className="text-muted-foreground flex items-center gap-1 text-xs">
            <ShieldCheck className="size-3.5" />
            {t('privacy-note')}
          </p>
        </CardContent>
      </Card>
    </div>
  )

  return (
    <div className="flex flex-col gap-4">
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
      {budget && !budget.ok && (
        <Alert variant="destructive">
          <AlertDescription>
            {t(`budget-${budget.reason}`, { limit: budget.suggestion[budget.reason] })}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
        <div className="min-w-0">{workspace}</div>
        <div className="min-w-0">{panel}</div>
      </div>
    </div>
  )
}
