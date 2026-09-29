import { Columns2, Grid3x3, Rows2, type LucideIcon } from 'lucide-react'
import { type ReactNode, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { PanelField, PanelSection, PanelSliderField } from '@/components/panel-fields'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import {
  CANVAS_RATIOS,
  countOf,
  directionOf,
  MAX_CELLS,
  MAX_TRACKS,
  MIN_COUNT,
  trackMax,
  type GridDirection,
  type GridTemplate,
} from '../image-stack.service'
import { splitTemplateOf, stitchTemplateOf, useImageStackStore } from '../store'
import { layoutsForCount, MAX_LAYOUT_COUNT } from '../layouts'
import { SPLIT_CUSTOM_TEMPLATE, SPLIT_TEMPLATES, STITCH_CUSTOM_TEMPLATE } from '../templates'

const DIRECTIONS: readonly GridDirection[] = ['row', 'col', 'grid']
const DIRECTION_ICONS: Record<GridDirection, LucideIcon> = {
  row: Columns2,
  col: Rows2,
  grid: Grid3x3,
}
const LAYOUT_COUNTS: number[] = Array.from({ length: MAX_LAYOUT_COUNT }, (_, index) => index + 1)

function ratioCss(ratioKey: string): string {
  const ratio = CANVAS_RATIOS.find((item) => item.key === ratioKey) ?? CANVAS_RATIOS[0]
  return `${ratio.width} / ${ratio.height}`
}

/** 版式缩略图：CSS Grid 与 GridTemplate 一一对应，权重当 fr、跨格当 span */
function TemplateThumb({ template }: { template: GridTemplate }) {
  return (
    <span
      className="grid size-full gap-[2px]"
      style={{
        gridTemplateColumns: template.cols.map((weight) => `${weight}fr`).join(' '),
        gridTemplateRows: template.rows.map((weight) => `${weight}fr`).join(' '),
      }}
    >
      {template.cells.map((cell) => (
        <span
          key={`${cell.col}-${cell.row}`}
          className="bg-muted-foreground/40 rounded-[1px]"
          style={{
            gridColumn: `${cell.col + 1} / span ${cell.colSpan ?? 1}`,
            gridRow: `${cell.row + 1} / span ${cell.rowSpan ?? 1}`,
          }}
        />
      ))}
    </span>
  )
}

function TemplateButton({
  template,
  label,
  caption,
  aspectRatio,
  selected,
  onSelect,
}: {
  template: GridTemplate
  label: string
  /** 缩略图下方的文字；生成目录里每个形状一眼可辨，留空更清爽 */
  caption?: string
  aspectRatio: string
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      title={label}
      aria-label={label}
      className={cn(
        'flex cursor-pointer flex-col gap-1 rounded-md p-1.5 transition-colors',
        selected ? 'bg-primary/10 ring-primary ring-1' : 'hover:bg-muted',
      )}
    >
      <span className="block w-full" style={{ aspectRatio }}>
        <TemplateThumb template={template} />
      </span>
      {caption ? (
        <span
          className={cn(
            'text-center text-[11px] leading-tight',
            selected ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          {caption}
        </span>
      ) : null}
    </button>
  )
}

/**
 * 方向 + 份数：横排/竖排是一个轴的事，只给一个份数 slider；
 * 选网格才展开列数与行数，且每轴的顶由总格数预算反推。
 */
function GridControls({
  cols,
  rows,
  onApply,
}: {
  cols: number
  rows: number
  onApply: (cols: number, rows: number) => void
}) {
  const { t } = useTranslation('tools-images', { keyPrefix: 'image-stack' })
  const direction = directionOf(cols, rows)
  const count = countOf(cols, rows)
  const colsCap = trackMax(rows)
  const rowsCap = trackMax(cols)
  const capped = colsCap < MAX_TRACKS || rowsCap < MAX_TRACKS

  return (
    <>
      <PanelField label={t('template.direction')} span={2}>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          spacing={0}
          className="w-full"
          value={direction}
          onValueChange={(value) => {
            if (!value) {
              return
            }
            const next = value as GridDirection
            const size = Math.max(MIN_COUNT, count)
            if (next === 'row') {
              onApply(size, 1)
            } else if (next === 'col') {
              onApply(1, size)
            } else {
              // 从一维切到网格：把长度为 1 的那一轴抬到 2，保住用户刚定的份数
              onApply(direction === 'col' ? 2 : cols, direction === 'row' ? 2 : rows)
            }
          }}
        >
          {DIRECTIONS.map((item) => {
            const Icon = DIRECTION_ICONS[item]
            return (
              <ToggleGroupItem key={item} value={item} className="flex-1 gap-1.5 text-xs">
                <Icon className="size-3.5" />
                {t(`template.directionValue.${item}`)}
              </ToggleGroupItem>
            )
          })}
        </ToggleGroup>
      </PanelField>

      {direction === 'grid' ? (
        <>
          <PanelSliderField
            label={t('template.cols')}
            value={cols}
            onChange={(value) => onApply(value, rows)}
            min={1}
            max={colsCap}
          />
          <PanelSliderField
            label={t('template.rows')}
            value={rows}
            onChange={(value) => onApply(cols, value)}
            min={1}
            max={rowsCap}
          />
          {capped ? (
            <p className="text-muted-foreground col-span-2 text-xs leading-tight">
              {t('template.cellCap', { cap: MAX_CELLS, cols: colsCap, rows: rowsCap })}
            </p>
          ) : null}
        </>
      ) : (
        <PanelSliderField
          label={t('template.count')}
          value={count}
          onChange={(value) => (direction === 'row' ? onApply(value, 1) : onApply(1, value))}
          min={MIN_COUNT}
          max={MAX_TRACKS}
          span={2}
        />
      )}
    </>
  )
}

function TemplatePicker({
  title,
  templates,
  labelFor,
  captions,
  customTemplate,
  customId,
  extra,
  cols,
  rows,
  aspectRatio,
  selectedId,
  onSelect,
  onApplyGrid,
}: {
  title: string
  templates: readonly GridTemplate[]
  /** 悬停与无障碍用的名字；等分网格显示「列×行」，生成目录显示序号 */
  labelFor: (template: GridTemplate, index: number) => string
  /** 生成目录里形状一眼可辨，不再在缩略图下面重复写字 */
  captions: boolean
  customTemplate: GridTemplate
  customId: string
  /** 段内首行：拆分放格数说明，拼接放张数选择器 */
  extra: ReactNode
  cols: number
  rows: number
  aspectRatio: string
  selectedId: string
  onSelect: (id: string) => void
  onApplyGrid: (cols: number, rows: number) => void
}) {
  const { t } = useTranslation('tools-images', { keyPrefix: 'image-stack' })

  return (
    <PanelSection title={title}>
      {extra}
      <div className="col-span-2 grid grid-cols-4 gap-1.5 sm:grid-cols-5">
        {templates.map((template, index) => (
          <TemplateButton
            key={template.id}
            template={template}
            aspectRatio={aspectRatio}
            selected={template.id === selectedId}
            onSelect={() => onSelect(template.id)}
            label={labelFor(template, index)}
            caption={captions ? labelFor(template, index) : undefined}
          />
        ))}
        <TemplateButton
          template={customTemplate}
          aspectRatio={aspectRatio}
          selected={selectedId === customId}
          onSelect={() => onSelect(customId)}
          label={t('template.custom')}
          caption={captions ? t('template.custom') : undefined}
        />
      </div>

      {/* 行列只服务于自定义档；预设档显示一排 slider 既没用又白占半屏高度 */}
      {selectedId === customId ? (
        <GridControls cols={cols} rows={rows} onApply={onApplyGrid} />
      ) : null}
    </PanelSection>
  )
}

/** 拼接与拆分共用一套缩略图语言，只是模板表与状态字段不同 */
export function TemplateGallery() {
  const mode = useImageStackStore((state) => state.mode)
  return mode === 'stitch' ? <StitchGallery /> : <SplitGallery />
}

function StitchGallery() {
  const { t } = useTranslation('tools-images', { keyPrefix: 'image-stack' })
  const selectedId = useImageStackStore((state) => state.stitchTemplateId)
  const cells = useImageStackStore((state) => state.stitchCells)
  const setStitchCells = useImageStackStore((state) => state.setStitchCells)
  const cols = useImageStackStore((state) => state.stitchCols)
  const rows = useImageStackStore((state) => state.stitchRows)
  const setStitchTemplate = useImageStackStore((state) => state.setStitchTemplate)
  const setStitchGrid = useImageStackStore((state) => state.setStitchGrid)
  const ratioKey = useImageStackStore((state) => state.ratioKey)
  const layouts = useMemo(() => layoutsForCount(cells), [cells])

  return (
    <TemplatePicker
      title={t('template.stitchTitle')}
      templates={layouts}
      labelFor={(_template, index) => t('template.variant', { index: index + 1 })}
      captions={false}
      customTemplate={stitchTemplateOf(STITCH_CUSTOM_TEMPLATE, cells, cols, rows)}
      customId={STITCH_CUSTOM_TEMPLATE}
      extra={
        <PanelField label={t('template.imageCount')} span={2}>
          <Select value={`${cells}`} onValueChange={(value) => setStitchCells(Number(value))}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LAYOUT_COUNTS.map((count) => (
                <SelectItem key={count} value={`${count}`}>
                  {t('template.imageCountValue', { total: count })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </PanelField>
      }
      cols={cols}
      rows={rows}
      aspectRatio={ratioCss(ratioKey)}
      selectedId={selectedId}
      onSelect={setStitchTemplate}
      onApplyGrid={setStitchGrid}
    />
  )
}

function SplitGallery() {
  const { t } = useTranslation('tools-images', { keyPrefix: 'image-stack' })
  const selectedId = useImageStackStore((state) => state.splitTemplateId)
  const cols = useImageStackStore((state) => state.splitCols)
  const rows = useImageStackStore((state) => state.splitRows)
  const setSplitTemplate = useImageStackStore((state) => state.setSplitTemplate)
  const setSplitGrid = useImageStackStore((state) => state.setSplitGrid)
  const ratioKey = useImageStackStore((state) => state.ratioKey)
  const active = splitTemplateOf(selectedId, cols, rows)

  return (
    <TemplatePicker
      title={t('template.splitTitle')}
      templates={SPLIT_TEMPLATES}
      labelFor={(template) => `${template.cols.length}×${template.rows.length}`}
      captions
      customTemplate={splitTemplateOf(SPLIT_CUSTOM_TEMPLATE, cols, rows)}
      customId={SPLIT_CUSTOM_TEMPLATE}
      extra={
        <p className="text-muted-foreground col-span-2 text-xs leading-tight">
          {t('template.cellCount', { total: active.cells.length })}
        </p>
      }
      cols={cols}
      rows={rows}
      aspectRatio={ratioCss(ratioKey)}
      selectedId={selectedId}
      onSelect={setSplitTemplate}
      onApplyGrid={setSplitGrid}
    />
  )
}
