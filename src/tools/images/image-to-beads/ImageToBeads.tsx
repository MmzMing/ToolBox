import { ClipboardPaste, Download, Expand, ImageUp, RotateCcw, Trash2, Upload } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ParamField } from '@/components/param-field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { BEAD_BRANDS, loadBrandColors } from './palettes'
import { BeadChartCanvas } from './components/BeadChartCanvas'
import { BeadLightbox } from './components/BeadLightbox'
import { BeadMosaic } from './components/BeadMosaic'
import { BeadStage } from './components/BeadStage'
import { downloadBlob, downloadText } from './download'
import { renderGridToContext } from './grid-render'
import {
  beadsForRect,
  boardsForGrid,
  buildBeadCsv,
  countBeads,
  GRID_MAX,
  mapToBeads,
  normalizeRect,
  restrictPalette,
  rgbToHex,
  sampleCells,
  type BeadColor,
} from './image-to-beads.service'
import { type Selection } from './selection'
import { useBeadImage } from './use-bead-image'

/** 选区比例预设：value 为宽 / 高，null 表示不锁定 */
const RATIOS = [
  { key: 'free', value: null },
  { key: '1:1', value: 1 },
  { key: '4:3', value: 4 / 3 },
  { key: '3:4', value: 3 / 4 },
  { key: '16:9', value: 16 / 9 },
  { key: '9:16', value: 9 / 16 },
] as const

/** 导出图纸的每格像素：印色号时至少留够字号 */
function exportCellSize(cols: number, rows: number, showRefs: boolean): number {
  if (showRefs) return 28
  return Math.max(8, Math.min(40, Math.ceil(2600 / Math.max(cols, rows))))
}

function baseFileName(name: string): string {
  return name.replace(/\.[^.]+$/, '').replace(/[^\w-]+/g, '-') || 'beads'
}

/** 工具条上的图标按钮：靠 Tooltip 说明用途，省掉一排文字按钮的宽度 */
function IconButton({
  label,
  onClick,
  destructive = false,
  children,
}: {
  label: string
  onClick: () => void
  destructive?: boolean
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={destructive ? 'destructive' : 'outline'}
          size="icon"
          aria-label={label}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/** 灯箱里的"圈中那块"：用等比放大 + 位移裁出选区，不再解一次码 */
function SelectionCrop({
  url,
  selection,
  sourceWidth,
  sourceHeight,
  displayWidth,
}: {
  url: string
  selection: Selection
  sourceWidth: number
  sourceHeight: number
  displayWidth: number
}) {
  const scale = displayWidth / (selection.width * sourceWidth)
  return (
    <div
      className="relative overflow-hidden"
      style={{
        width: displayWidth,
        height: selection.height * sourceHeight * scale,
      }}
    >
      <img
        src={url}
        alt=""
        draggable={false}
        className="absolute max-w-none"
        style={{
          width: sourceWidth * scale,
          height: sourceHeight * scale,
          left: -selection.x * sourceWidth * scale,
          top: -selection.y * sourceHeight * scale,
        }}
      />
    </div>
  )
}

/** 图片转拼豆：整张图铺在中间，鼠标圈定有效范围，右侧调参并出成品预览与用色清单 */
export default function ImageToBeads() {
  const { t } = useTranslation('tools-images', { keyPrefix: 'image-to-beads' })
  const { source, selection, setSelection, resetSelection, isDecoding, error, load, clear } =
    useBeadImage()

  const [brandKey, setBrandKey] = useState<string>(BEAD_BRANDS[0].key)
  const [palette, setPalette] = useState<readonly BeadColor[]>([])
  const [ratioKey, setRatioKey] = useState<string>('free')
  const [tab, setTab] = useState<'stage' | 'preview'>('stage')
  const [pixelsPerBead, setPixelsPerBead] = useState(8)
  const [alphaThreshold, setAlphaThreshold] = useState(0)
  const [maxColors, setMaxColors] = useState(24)
  const [dither, setDither] = useState(false)
  const [showRefs, setShowRefs] = useState(false)
  const [backgroundWhite, setBackgroundWhite] = useState(true)
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const aspect = RATIOS.find((item) => item.key === ratioKey)?.value ?? null

  useEffect(() => {
    let cancelled = false
    void loadBrandColors(brandKey).then((colors) => {
      if (!cancelled) setPalette(colors)
    })
    return () => {
      cancelled = true
    }
  }, [brandKey])

  const rect = useMemo(() => {
    if (!source) return null
    return normalizeRect(
      {
        x: selection.x * source.width,
        y: selection.y * source.height,
        width: selection.width * source.width,
        height: selection.height * source.height,
      },
      source.width,
      source.height,
    )
  }, [source, selection])

  /** 选区大小 ÷ 颗粒度 = 颗数，板数是推导结果 */
  const { cols, rows } = useMemo(
    () => (rect ? beadsForRect(rect, pixelsPerBead) : { cols: 0, rows: 0 }),
    [rect, pixelsPerBead],
  )

  /** 选区 → 格数与徽标：拖动过程中每帧都要用，所以只做算术，不跑量化 */
  const describeSelection = useCallback(
    (next: Selection) => {
      if (!source) return { cols: 1, rows: 1, badge: '' }
      const area = normalizeRect(
        {
          x: next.x * source.width,
          y: next.y * source.height,
          width: next.width * source.width,
          height: next.height * source.height,
        },
        source.width,
        source.height,
      )
      const sized = beadsForRect(area, pixelsPerBead)
      const count = boardsForGrid(sized.cols, sized.rows)
      return {
        ...sized,
        badge: t('stage.badge', {
          cols: sized.cols,
          rows: sized.rows,
          boardsX: count.cols,
          boardsY: count.rows,
        }),
      }
    },
    [source, pixelsPerBead, t],
  )

  const cells = useMemo(() => {
    if (!source || !rect || palette.length === 0 || cols === 0) return []
    return sampleCells(source.pixels, source.width, source.height, {
      cols,
      rows,
      alphaThreshold,
      rect,
    })
  }, [source, rect, palette, cols, rows, alphaThreshold])

  const allowed = useMemo(
    () =>
      cells.length > 0 && palette.length > 0 ? restrictPalette(cells, palette, maxColors) : null,
    [cells, palette, maxColors],
  )

  const grid = useMemo(() => {
    if (cells.length === 0 || palette.length === 0) return null
    return mapToBeads(cells, cols, rows, palette, allowed, { dither })
  }, [cells, palette, allowed, cols, rows, dither])

  const usage = useMemo(() => (grid ? countBeads(grid, palette) : []), [grid, palette])
  const totalBeads = usage.reduce((sum, item) => sum + item.count, 0)
  const boards = boardsForGrid(Math.max(1, cols), Math.max(1, rows))
  const isCapped = cols >= GRID_MAX || rows >= GRID_MAX
  const showPreview = tab === 'preview' && !!grid

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0]
    if (file) void load(file)
  }

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      for (const item of event.clipboardData?.items ?? []) {
        if (!item.type.startsWith('image/')) continue
        const file = item.getAsFile()
        if (file) {
          void load(file)
          return
        }
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [load])

  const handleExportPng = (shape: 'square' | 'bead') => {
    if (!grid) return
    const size = exportCellSize(cols, rows, showRefs)
    const canvas = document.createElement('canvas')
    canvas.width = cols * size
    canvas.height = rows * size
    const context = canvas.getContext('2d')
    if (!context) return
    renderGridToContext(context, {
      grid,
      palette,
      cellSize: size,
      showRefs,
      fillBackground: backgroundWhite,
      shape,
    })
    canvas.toBlob((blob) => {
      if (blob) {
        const tag = shape === 'bead' ? 'preview' : 'chart'
        downloadBlob(blob, `${baseFileName(source?.name ?? 'beads')}-${tag}-${cols}x${rows}.png`)
      }
    }, 'image/png')
  }

  const handleExportCsv = () => {
    if (!grid) return
    downloadText(
      buildBeadCsv(usage, {
        ref: t('usage.ref'),
        name: t('usage.name'),
        rgb: t('usage.rgb'),
        count: t('usage.count'),
        ratio: t('usage.ratio'),
      }),
      `${baseFileName(source?.name ?? 'beads')}-colors.csv`,
      'text/csv',
    )
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      {/* 中：图片操作台（原图圈选 / 成品预览共用这一块位置） */}
      <div className="flex min-w-0 flex-col gap-3">
        {source ? (
          <Tabs
            value={tab}
            onValueChange={(value) => setTab(value as 'stage' | 'preview')}
            className="gap-3"
          >
            <BeadStage
              imageUrl={source.url}
              imageName={source.name}
              mode={showPreview ? 'preview' : 'source'}
              selection={selection}
              onCommit={setSelection}
              describe={describeSelection}
              aspect={aspect}
              chart={
                grid ? (
                  <BeadChartCanvas
                    grid={grid}
                    palette={palette}
                    showRefs={showRefs}
                    backgroundWhite={backgroundWhite}
                    label={t('preview.ariaLabel', { cols, rows })}
                    sizing="fill"
                  />
                ) : null
              }
            >
              {grid ? (
                <BeadMosaic
                  grid={grid}
                  palette={palette}
                  backgroundWhite={backgroundWhite}
                  label={t('preview.ariaLabel', { cols, rows })}
                />
              ) : null}
            </BeadStage>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <span className="text-muted-foreground text-xs">{t('stage.ratio')}</span>
              <Select value={ratioKey} onValueChange={setRatioKey}>
                <SelectTrigger className="h-8 w-24 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RATIOS.map((item) => (
                    <SelectItem key={item.key} value={item.key} className="text-xs">
                      {item.key === 'free' ? t('stage.ratioFree') : item.key}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <TabsList className="h-8">
                <TabsTrigger value="stage" className="text-xs">
                  {t('stage.tabStage')}
                </TabsTrigger>
                <TabsTrigger value="preview" className="text-xs" disabled={!grid}>
                  {t('stage.tabPreview')}
                </TabsTrigger>
              </TabsList>
              <Separator orientation="vertical" className="h-6" />
              <IconButton label={t('stage.resetAll')} onClick={resetSelection}>
                <Expand className="size-4" />
              </IconButton>
              <IconButton label={t('stage.change')} onClick={() => fileInputRef.current?.click()}>
                <Upload className="size-4" />
              </IconButton>
              <BeadLightbox
                initialView={showPreview ? 'chart' : 'source'}
                chartView={
                  grid ? (
                    <BeadChartCanvas
                      grid={grid}
                      palette={palette}
                      showRefs={showRefs}
                      backgroundWhite={backgroundWhite}
                      label={t('preview.ariaLabel', { cols, rows })}
                      sizing="natural"
                    />
                  ) : null
                }
                sourceView={
                  // 1:1 铺出选区的解码尺寸，缩放到 100% 以上时浏览器会取原图的真细节
                  <SelectionCrop
                    url={source.url}
                    selection={selection}
                    sourceWidth={source.width}
                    sourceHeight={source.height}
                    displayWidth={selection.width * source.width}
                  />
                }
              />
              <IconButton label={t('stage.remove')} onClick={clear} destructive>
                <Trash2 className="size-4" />
              </IconButton>
            </div>
            {isCapped ? (
              <p className="text-muted-foreground text-center text-xs">
                {t('stage.capped', { max: GRID_MAX })}
              </p>
            ) : null}
          </Tabs>
        ) : (
          <div
            role="button"
            tabIndex={0}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') fileInputRef.current?.click()
            }}
            onDragOver={(event) => {
              event.preventDefault()
              setIsDragOver(true)
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(event) => {
              event.preventDefault()
              setIsDragOver(false)
              handleFiles(event.dataTransfer.files)
            }}
            className={cn(
              'flex min-h-[420px] cursor-pointer flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed p-8 text-center transition-colors',
              isDragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50',
            )}
          >
            <span className="bg-primary/10 text-primary flex size-16 items-center justify-center rounded-2xl">
              <ImageUp className="size-8" />
            </span>
            <div className="flex flex-col gap-1">
              <p className="text-base font-semibold">{t('stage.dropTitle')}</p>
              <p className="text-muted-foreground text-sm">{t('stage.dropSubtitle')}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={isDecoding}
              onClick={(event) => {
                event.stopPropagation()
                fileInputRef.current?.click()
              }}
            >
              {t('stage.browse')}
            </Button>
            <p className="text-muted-foreground bg-muted/60 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs">
              <ClipboardPaste className="size-3.5" />
              {t('stage.paste')}
            </p>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => handleFiles(event.target.files)}
        />
        {isDecoding && source ? (
          <p className="text-muted-foreground flex items-center justify-center gap-2 text-xs">
            <RotateCcw className="size-3 animate-spin" />
            {t('stage.decoding')}
          </p>
        ) : null}
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{t(`stage.error.${error}`)}</AlertDescription>
          </Alert>
        ) : null}

        {grid ? (
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            <Button onClick={() => handleExportPng('square')}>
              <Download className="size-4" />
              {t('export.png')}
            </Button>
            <Button variant="outline" onClick={() => handleExportPng('bead')}>
              <Download className="size-4" />
              {t('export.preview')}
            </Button>
            <Button variant="outline" onClick={handleExportCsv}>
              <Download className="size-4" />
              {t('export.csv')}
            </Button>
          </div>
        ) : null}

        <p className="text-muted-foreground text-xs">
          {t('notes.source')}{' '}
          <a
            href="https://github.com/maxcleme/beadcolors"
            target="_blank"
            rel="noreferrer"
            className="text-primary underline-offset-2 hover:underline"
          >
            {t('notes.repo')}
          </a>
        </p>
      </div>

      {/* 右：参数、成品预览与用色清单 */}
      <div className="flex min-w-0 flex-col gap-4">
        <Card className="gap-4">
          <CardHeader className="border-border border-b pb-0">
            <CardTitle className="text-sm">{t('panel.title')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <ParamField
              label={t('panel.brand')}
              hint={t('panel.brandHint', { count: palette.length })}
            >
              <Select value={brandKey} onValueChange={setBrandKey}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BEAD_BRANDS.map((entry) => (
                    <SelectItem key={entry.key} value={entry.key}>
                      {entry.label} · {entry.beadSizeMm} mm · {entry.colorCount}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </ParamField>

            <ParamField
              label={t('panel.grain')}
              hint={t('panel.grainValue', { px: pixelsPerBead })}
              htmlFor="beads-grain"
            >
              <Slider
                id="beads-grain"
                min={2}
                max={40}
                step={1}
                value={[pixelsPerBead]}
                onValueChange={([value = 8]) => setPixelsPerBead(value)}
              />
            </ParamField>

            {rect ? (
              <ParamField
                label={t('panel.width')}
                hint={t('panel.widthValue', { cols, spanX: boards.cols, spanY: boards.rows })}
                inline
              />
            ) : null}

            <Separator />

            <ParamField
              label={t('panel.colors')}
              hint={
                maxColors === 0
                  ? t('panel.unlimited')
                  : t('panel.colorsValue', { count: maxColors, used: usage.length })
              }
            >
              <Slider
                min={0}
                max={64}
                step={4}
                value={[maxColors]}
                onValueChange={([value = 24]) => setMaxColors(value)}
              />
            </ParamField>

            <ParamField label={t('panel.dither')} inline>
              <Switch checked={dither} onCheckedChange={setDither} />
            </ParamField>

            <ParamField
              label={t('panel.alpha')}
              hint={`${Math.round((alphaThreshold / 255) * 100)}%`}
            >
              <Slider
                min={0}
                max={255}
                step={5}
                value={[alphaThreshold]}
                onValueChange={([value = 0]) => setAlphaThreshold(value)}
              />
            </ParamField>

            <Separator />

            <ParamField label={t('panel.refs')} inline>
              <Switch checked={showRefs} onCheckedChange={setShowRefs} />
            </ParamField>

            <ParamField label={t('panel.background')} inline>
              <ToggleGroup
                type="single"
                variant="outline"
                spacing={0}
                value={backgroundWhite ? 'white' : 'transparent'}
                onValueChange={(value) => value && setBackgroundWhite(value === 'white')}
              >
                <ToggleGroupItem value="white" className="text-xs">
                  {t('panel.white')}
                </ToggleGroupItem>
                <ToggleGroupItem value="transparent" className="text-xs">
                  {t('panel.transparent')}
                </ToggleGroupItem>
              </ToggleGroup>
            </ParamField>
          </CardContent>
        </Card>

        {grid ? (
          <Card className="gap-3 pb-0">
            <CardHeader className="border-border flex-row items-center justify-between border-b pb-0">
              <CardTitle className="text-sm">{t('usage.title')}</CardTitle>
              <span className="text-muted-foreground text-xs">
                {t('usage.total', { count: totalBeads })} ·{' '}
                {t('preview.colorsUsed', { count: usage.length })}
              </span>
            </CardHeader>
            {/* 滚动区贴到卡片下沿：卡片自身去掉下内边距，表头靠这一层做 sticky */}
            <CardContent className="min-h-0 px-4 pb-0">
              {usage.length === 0 ? (
                <p className="text-muted-foreground pb-4 text-sm">{t('usage.empty')}</p>
              ) : (
                <div className="max-h-72 min-h-0 overflow-y-auto">
                  <div className="text-muted-foreground bg-card sticky top-0 grid grid-cols-[minmax(0,1fr)_3.5rem_3.5rem_4rem] gap-2 py-2 text-xs font-medium">
                    <span>{t('usage.ref')}</span>
                    <span className="text-right">{t('usage.count')}</span>
                    <span className="text-right">{t('usage.ratio')}</span>
                    <span className="text-right">{t('usage.stock')}</span>
                  </div>
                  {usage.map((item) => (
                    <div
                      key={item.color.ref}
                      className="border-border grid grid-cols-[minmax(0,1fr)_3.5rem_3.5rem_4rem] items-center gap-2 border-t py-2 text-xs"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className="border-border size-4 shrink-0 rounded-sm border"
                          style={{ backgroundColor: rgbToHex(item.color.rgb) }}
                        />
                        <span className="truncate font-mono">{item.color.ref}</span>
                      </span>
                      <span className="text-right font-mono">{item.count}</span>
                      <span className="text-right font-mono">{(item.ratio * 100).toFixed(1)}%</span>
                      <span className="text-right font-mono">{Math.ceil(item.count * 1.1)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  )
}
