import { ScanLine } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import {
  PanelField,
  PanelGroup,
  PanelNumberField,
  PanelRadioField,
  PanelSection,
  PanelSelectField,
  PanelSliderField,
  PanelSwitchField,
  PanelTextField,
} from '@/components/panel-fields'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import { MAX_GAP, MAX_PADDING, MAX_RADIUS } from '../image-stack.service'
import {
  LONG_ALIGNMENTS,
  LONG_CAPTION_PLACES,
  LONG_NARROW_FILLS,
  LONG_PRESETS,
  LONG_WIDTH_MODES,
  MAX_BAND_RADIUS,
  MAX_CAPTION_INSET,
  MAX_CAPTION_SIZE,
  MAX_KEEP_BOTTOM_PERCENT,
  MAX_LONG_WIDTH,
  MAX_SHADOW_BLUR,
  MAX_SHADOW_OFFSET,
  MAX_SHADOW_OPACITY,
  MAX_STACK_OVERLAP,
  MIN_KEEP_BOTTOM_PERCENT,
  MIN_LONG_WIDTH,
  resolveLongCrop,
  type LongAlign,
  type LongCaptionPlace,
  type LongNarrowFill,
  type LongPresetId,
  type LongWidthMode,
} from '../long-stack.service'
import { useImageStackStore } from '../store'
import { useLongOverlap, type LongOverlapRunner } from '../use-long-overlap'
import { useLongGeometry, useReadyAssets } from '../use-scene'
import { BackgroundField } from './BackgroundField'

/**
 * 长图配置栏，放在左侧：右边那条成品可能有上万像素高，
 * 参数必须在离眼睛最近的地方，而不是要滚到成品底下才看得到。
 */
export function LongConfigPanel({ className }: { className?: string }) {
  const { t } = useTranslation('tools-images', { keyPrefix: 'image-stack' })
  const style = useImageStackStore((state) => state.longStyle)
  const setLongStyle = useImageStackStore((state) => state.setLongStyle)
  const presetId = useImageStackStore((state) => state.longPresetId)
  const setLongPreset = useImageStackStore((state) => state.setLongPreset)
  const defaults = useImageStackStore((state) => state.longCropDefaults)
  const setLongKeepBottomPercent = useImageStackStore((state) => state.setLongKeepBottomPercent)
  const resetLongCrops = useImageStackStore((state) => state.resetLongCrops)
  const { layout, ignored } = useLongGeometry()
  const assets = useReadyAssets()
  const overlap = useLongOverlap()

  return (
    <PanelGroup className={cn('min-w-0', className)}>
      <PanelSection title={t('long.preset')}>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          spacing={0}
          className="col-span-2 flex-wrap"
          aria-label={t('long.preset')}
          value={presetId}
          onValueChange={(value) => {
            if (value) {
              setLongPreset(value as LongPresetId)
            }
          }}
        >
          {LONG_PRESETS.map((preset) => (
            <ToggleGroupItem key={preset.id} value={preset.id} className="px-2.5 text-xs">
              {t(`long.presetValue.${preset.id}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <p className="text-muted-foreground col-span-2 text-xs leading-tight">
          {t(`long.presetHint.${presetId}`)}
        </p>
      </PanelSection>

      <PanelSection title={t('long.crop')}>
        <PanelSliderField
          label={t('long.keepBottom')}
          value={Math.round(defaults.keepBottomPercent)}
          onChange={setLongKeepBottomPercent}
          min={MIN_KEEP_BOTTOM_PERCENT}
          max={MAX_KEEP_BOTTOM_PERCENT}
          span={2}
          format={(value) => t('long.keepBottomValue', { percent: value })}
        />
        <p className="text-muted-foreground col-span-2 text-xs leading-tight">
          {t('long.keepBottomHint')}
        </p>
        <div className="col-span-2 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1.5"
            disabled={overlap.isRunning || layout.bands.length < 2}
            onClick={() => void overlap.detectAll()}
          >
            <ScanLine className="size-4" />
            {overlap.isRunning ? t('long.dedupRunning') : t('long.dedup')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-muted-foreground"
            onClick={resetLongCrops}
          >
            {t('long.resetCrops')}
          </Button>
        </div>
        <p className="text-muted-foreground col-span-2 text-xs leading-tight">
          {t('long.dedupHint')}
        </p>
      </PanelSection>

      <PanelSection title={t('long.width')} defaultOpen={false}>
        <PanelSelectField
          label={t('long.widthModeLabel')}
          value={style.widthMode}
          onChange={(value) => setLongStyle({ widthMode: value as LongWidthMode })}
          options={LONG_WIDTH_MODES.map((value) => ({
            value,
            label: t(`long.widthMode.${value}`),
          }))}
          hint={t('long.widthModeHint')}
          span={2}
        />
        {style.widthMode === 'custom' ? (
          <PanelNumberField
            label={t('canvas.width')}
            value={String(style.targetWidth)}
            min={MIN_LONG_WIDTH}
            max={MAX_LONG_WIDTH}
            span={2}
            onChange={(value) => {
              const width = Number(value)
              if (value !== '' && Number.isFinite(width)) {
                setLongStyle({ targetWidth: width })
              }
            }}
          />
        ) : null}
        <PanelRadioField
          label={t('long.align')}
          value={style.align}
          onChange={(value) => setLongStyle({ align: value as LongAlign })}
          options={LONG_ALIGNMENTS.map((value) => ({
            value,
            label: t(`long.alignValue.${value}`),
          }))}
        />
      </PanelSection>

      <PanelSection title={t('style.title')} defaultOpen={false}>
        <PanelSliderField
          label={t('style.gap')}
          value={style.gap}
          onChange={(value) => setLongStyle({ gap: value })}
          min={0}
          max={MAX_GAP}
          format={(value) => `${value} px`}
        />
        <PanelSliderField
          label={t('style.padding')}
          value={style.padding}
          onChange={(value) => setLongStyle({ padding: value })}
          min={0}
          max={MAX_PADDING}
          format={(value) => `${value} px`}
        />
        <PanelSliderField
          label={t('style.canvasRadius')}
          value={style.canvasRadius}
          onChange={(value) => setLongStyle({ canvasRadius: value })}
          min={0}
          max={MAX_RADIUS}
          format={(value) => `${value} px`}
        />
        <PanelSliderField
          label={t('long.bandRadius')}
          value={style.bandRadius}
          onChange={(value) => setLongStyle({ bandRadius: value })}
          min={0}
          max={MAX_BAND_RADIUS}
          format={(value) => `${value} px`}
        />
        <PanelRadioField
          label={t('long.narrowFill')}
          value={style.narrowFill}
          onChange={(value) => setLongStyle({ narrowFill: value as LongNarrowFill })}
          options={LONG_NARROW_FILLS.map((value) => ({
            value,
            label: t(`long.narrowFillValue.${value}`),
          }))}
          hint={t('long.narrowFillHint')}
        />
        <BackgroundField
          value={style.background}
          onChange={(background) => setLongStyle({ background })}
        />
      </PanelSection>

      <PanelSection title={t('long.card')} defaultOpen={false}>
        <PanelSliderField
          label={t('long.stackOverlap')}
          value={style.stackOverlap}
          onChange={(value) => setLongStyle({ stackOverlap: value })}
          min={0}
          max={MAX_STACK_OVERLAP}
          span={2}
          format={(value) => `${value} px`}
        />
        <p className="text-muted-foreground col-span-2 text-xs leading-tight">
          {t('long.stackOverlapHint')}
        </p>
        <PanelSliderField
          label={t('long.shadowBlur')}
          value={style.shadow.blur}
          onChange={(value) => setLongStyle({ shadow: { ...style.shadow, blur: value } })}
          min={0}
          max={MAX_SHADOW_BLUR}
          format={(value) => (value === 0 ? t('long.shadowOff') : `${value} px`)}
        />
        <PanelSliderField
          label={t('long.shadowOpacity')}
          value={style.shadow.opacity}
          onChange={(value) => setLongStyle({ shadow: { ...style.shadow, opacity: value } })}
          min={0}
          max={MAX_SHADOW_OPACITY}
          format={(value) => `${value}%`}
        />
        <PanelSliderField
          label={t('long.shadowOffset')}
          value={style.shadow.offsetY}
          onChange={(value) => setLongStyle({ shadow: { ...style.shadow, offsetY: value } })}
          min={0}
          max={MAX_SHADOW_OFFSET}
          span={2}
          format={(value) => `${value} px`}
        />
      </PanelSection>

      <PanelSection title={t('long.caption')} defaultOpen={false}>
        <PanelSwitchField
          label={t('long.captionEnabled')}
          checked={style.caption.enabled}
          onChange={(enabled) => setLongStyle({ caption: { ...style.caption, enabled } })}
          span={2}
        />
        {style.caption.enabled ? (
          <>
            <PanelTextField
              label={t('long.captionText')}
              value={style.caption.text}
              span={2}
              hint={t('long.captionTextHint')}
              onChange={(text) => setLongStyle({ caption: { ...style.caption, text } })}
            />
            <PanelRadioField
              label={t('long.captionPlace')}
              value={style.caption.place}
              onChange={(value) =>
                setLongStyle({ caption: { ...style.caption, place: value as LongCaptionPlace } })
              }
              options={LONG_CAPTION_PLACES.map((value) => ({
                value,
                label: t(`long.captionPlaceValue.${value}`),
              }))}
            />
            <PanelSliderField
              label={t('long.captionSize')}
              value={style.caption.size}
              onChange={(size) => setLongStyle({ caption: { ...style.caption, size } })}
              min={8}
              max={MAX_CAPTION_SIZE}
              format={(value) => `${value} px`}
            />
            <PanelSliderField
              label={t('long.captionInset')}
              value={style.caption.inset}
              onChange={(inset) => setLongStyle({ caption: { ...style.caption, inset } })}
              min={0}
              max={MAX_CAPTION_INSET}
              format={(value) => `${value} px`}
            />
            <PanelField label={t('long.captionColor')} htmlFor="long-caption-color">
              <input
                id="long-caption-color"
                type="color"
                value={style.caption.color}
                aria-label={t('long.captionColor')}
                onChange={(event) =>
                  setLongStyle({ caption: { ...style.caption, color: event.target.value } })
                }
                className="border-border h-9 w-full cursor-pointer rounded-md border bg-transparent p-1"
              />
            </PanelField>
          </>
        ) : null}
      </PanelSection>

      <PanelSection title={t('long.items')}>
        <ul className="col-span-2 flex flex-col gap-2">
          {layout.bands.map((band, index) => (
            <ItemRow
              key={band.imageId}
              imageId={band.imageId}
              index={index}
              lead={index === 0}
              sourceImageHeight={band.sourceImageHeight}
              thumbUrl={assets[index]?.thumbUrl ?? ''}
              name={assets[index]?.name ?? ''}
              overlap={overlap}
            />
          ))}
        </ul>
        {ignored > 0 ? (
          <p className="text-muted-foreground col-span-2 text-xs leading-tight">
            {t('long.ignored', { total: ignored })}
          </p>
        ) : null}
      </PanelSection>

      <PanelSection title={t('long.output')} defaultOpen={false}>
        <p className="text-muted-foreground col-span-2 font-mono text-xs">
          {t('long.pixels', {
            width: layout.width,
            height: layout.height,
            megapixels: Math.round((layout.width * layout.height) / 10_000) / 100,
          })}
        </p>
        {layout.segments.length > 1 ? (
          <p className="text-muted-foreground col-span-2 text-xs leading-tight">
            {t('long.segments', { total: layout.segments.length, px: layout.maxSegmentHeight })}
          </p>
        ) : null}
        {layout.unsplittable.length > 0 ? (
          <p className="text-destructive col-span-2 text-xs leading-tight">
            {t('long.unsplittable', { total: layout.unsplittable.length })}
          </p>
        ) : null}
      </PanelSection>
    </PanelGroup>
  )
}

function ItemRow({
  imageId,
  index,
  lead,
  sourceImageHeight,
  thumbUrl,
  name,
  overlap,
}: {
  imageId: string
  index: number
  lead: boolean
  sourceImageHeight: number
  thumbUrl: string
  name: string
  overlap: LongOverlapRunner
}) {
  const { t } = useTranslation('tools-images', { keyPrefix: 'image-stack' })
  const selection = useImageStackStore((state) => state.longSelection)
  const selectLongItem = useImageStackStore((state) => state.selectLongItem)
  const override = useImageStackStore(
    (state) => state.longItems.find((entry) => entry.imageId === imageId)?.crop ?? null,
  )
  const defaults = useImageStackStore((state) => state.longCropDefaults)
  const setLongItemCrop = useImageStackStore((state) => state.setLongItemCrop)
  const syncLongCropToAll = useImageStackStore((state) => state.syncLongCropToAll)

  const effective = resolveLongCrop(override, defaults)
  const selected = selection === imageId
  const percent = lead ? 100 : Math.round(effective.keepBottomPercent)

  return (
    <li className="border-border/60 flex flex-col gap-2 border-t pt-2 first:border-0 first:pt-0">
      <button
        type="button"
        onClick={() => selectLongItem(selected ? null : imageId)}
        aria-pressed={selected}
        className={cn(
          'flex w-full cursor-pointer items-center gap-2 rounded-md text-left text-xs',
          selected && 'text-primary font-medium',
        )}
      >
        <img
          src={thumbUrl}
          alt=""
          className="border-border size-8 shrink-0 rounded border object-cover"
        />
        <span className="text-muted-foreground shrink-0 font-mono">{index + 1}</span>
        <span className="min-w-0 flex-1 truncate">{name}</span>
        <span className="shrink-0 font-mono">{lead ? t('long.itemLead') : `${percent}%`}</span>
      </button>

      {selected && !lead ? (
        <>
          <PanelSliderField
            label={t('long.keepBottom')}
            value={percent}
            onChange={(value) =>
              setLongItemCrop(imageId, { ...effective, keepBottomPercent: value })
            }
            min={MIN_KEEP_BOTTOM_PERCENT}
            max={MAX_KEEP_BOTTOM_PERCENT}
            span={2}
            format={(value) =>
              t('long.itemKeepBottomValue', {
                percent: value,
                px: Math.round((sourceImageHeight * value) / 100),
              })
            }
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={overlap.isRunning}
              onClick={() => void overlap.detectSeam(imageId)}
            >
              {overlap.isRunning ? t('long.dedupRunning') : t('long.dedupThis')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => syncLongCropToAll(imageId)}
            >
              {t('long.applyAll')}
            </Button>
            {override ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setLongItemCrop(imageId, null)}
              >
                {t('long.inherit')}
              </Button>
            ) : null}
            {effective.trimTopPx > 0 ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-muted-foreground ml-auto"
                onClick={() => setLongItemCrop(imageId, { ...effective, trimTopPx: 0 })}
              >
                {t('long.dedupClear')}
              </Button>
            ) : null}
          </div>
          {effective.trimTopPx > 0 ? (
            <p className="text-muted-foreground text-xs leading-tight">
              {t('long.trimmed', { px: effective.trimTopPx })}
            </p>
          ) : null}
        </>
      ) : null}
    </li>
  )
}
