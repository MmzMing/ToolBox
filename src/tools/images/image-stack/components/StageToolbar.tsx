import { useTranslation } from 'react-i18next'

import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  CANVAS_RATIOS,
  CANVAS_SIZE_PRESETS,
  CUSTOM_SIZE_KEY,
  MAX_CANVAS_SIDE,
  MIN_CANVAS_SIDE,
  type RatioKey,
} from '../image-stack.service'
import { useImageStackStore } from '../store'
import { useSplitGeometry } from '../use-scene'
import { ExportDialog } from './ExportDialog'

/**
 * 拆分：一键把裁切框推到顶/中/底。精细位置直接在预览上拖拽与滚轮，
 * 所以这里只是快捷键——拖过之后焦点不在三档上时，没有按钮呈按下态。
 */
const ANCHOR_PRESETS: readonly { value: string; y: number }[] = [
  { value: 'center', y: 0 },
  { value: 'top', y: -1 },
  { value: 'bottom', y: 1 },
]

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-muted-foreground shrink-0 text-xs">{children}</span>
}

function RatioPicker() {
  const { t } = useTranslation('tools-images', { keyPrefix: 'image-stack' })
  const ratioKey = useImageStackStore((state) => state.ratioKey)
  const setRatio = useImageStackStore((state) => state.setRatio)

  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      spacing={0}
      aria-label={t('canvas.ratio')}
      value={ratioKey}
      onValueChange={(value) => {
        if (value) {
          setRatio(value as RatioKey)
        }
      }}
    >
      {CANVAS_RATIOS.map((ratio) => (
        <ToggleGroupItem key={ratio.key} value={ratio.key} className="px-2.5 text-xs">
          {ratio.key}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

function SizeInput({
  value,
  label,
  onChange,
}: {
  value: number
  label: string
  onChange: (value: number) => void
}) {
  return (
    <label className="flex items-center gap-1">
      <span className="sr-only">{label}</span>
      <Input
        type="number"
        inputMode="numeric"
        min={MIN_CANVAS_SIDE}
        max={MAX_CANVAS_SIDE}
        step={1}
        value={value}
        aria-label={label}
        className="h-7 w-20 text-xs"
        onChange={(event) => {
          // 输入框清空时不要立刻跳到下限，否则没法删掉重打
          if (event.target.value === '') {
            return
          }
          const next = Number(event.target.value)
          if (Number.isFinite(next)) {
            onChange(next)
          }
        }}
      />
      <span className="text-muted-foreground text-xs">px</span>
    </label>
  )
}

/** 拼接：比例决定形状，尺寸档决定像素 */
function CanvasControls() {
  const { t } = useTranslation('tools-images', { keyPrefix: 'image-stack' })
  const ratioKey = useImageStackStore((state) => state.ratioKey)
  const presetKey = useImageStackStore((state) => state.presetKey)
  const customSize = useImageStackStore((state) => state.customSize)
  const setPreset = useImageStackStore((state) => state.setPreset)
  const setCustomSize = useImageStackStore((state) => state.setCustomSize)
  const presets = CANVAS_SIZE_PRESETS[ratioKey]

  return (
    <>
      <FieldLabel>{t('canvas.size')}</FieldLabel>
      <Select value={presetKey} onValueChange={setPreset}>
        <SelectTrigger size="sm" className="w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {presets.map((preset) => (
            <SelectItem key={preset.key} value={preset.key}>
              {preset.width} × {preset.height} · {t(`canvas.tier.${preset.key}`)}
            </SelectItem>
          ))}
          <SelectItem value={CUSTOM_SIZE_KEY}>{t('canvas.tier.custom')}</SelectItem>
        </SelectContent>
      </Select>
      {presetKey === CUSTOM_SIZE_KEY ? (
        <>
          <SizeInput
            value={customSize.width}
            label={t('canvas.width')}
            onChange={(width) => setCustomSize({ width, height: customSize.height })}
          />
          <span className="text-muted-foreground text-xs">×</span>
          <SizeInput
            value={customSize.height}
            label={t('canvas.height')}
            onChange={(height) => setCustomSize({ width: customSize.width, height })}
          />
        </>
      ) : null}
    </>
  )
}

/** 拆分：锚点决定竖图裁掉哪一段，横图裁切固定居中所以它没作用时禁用 */
function CropControls() {
  const { t } = useTranslation('tools-images', { keyPrefix: 'image-stack' })
  const splitFocus = useImageStackStore((state) => state.splitFocus)
  const setSplitFocus = useImageStackStore((state) => state.setSplitFocus)
  const geometry = useSplitGeometry()
  // 源图比目标比例更宽时裁的是左右，纵向焦点不产生任何差别，禁用比隐藏更能说明当前状态
  const hasVerticalSlack = geometry ? geometry.crop.height < geometry.source.height : false
  const preset = ANCHOR_PRESETS.find((item) => Math.abs(splitFocus.y - item.y) < 0.01)?.value

  return (
    <>
      <FieldLabel>{t('crop.anchor')}</FieldLabel>
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        spacing={0}
        aria-label={t('crop.anchor')}
        value={preset ?? ''}
        disabled={!hasVerticalSlack}
        onValueChange={(value) => {
          const next = ANCHOR_PRESETS.find((item) => item.value === value)
          if (next) {
            setSplitFocus({ ...splitFocus, y: next.y })
          }
        }}
      >
        {ANCHOR_PRESETS.map((item) => (
          <ToggleGroupItem key={item.value} value={item.value} className="px-2.5 text-xs">
            {t(`crop.anchorValue.${item.value}`)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </>
  )
}

/**
 * 画布正上方的工具条：比例、尺寸（拼接）或锚点（拆分）、导出。
 * 这些控件都只作用于当前画布，放右侧栏里要来回视线对齐，所以搬到画布边上。
 */
export function StageToolbar() {
  const mode = useImageStackStore((state) => state.mode)

  return (
    <div className="border-border bg-card flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <RatioPicker />
        {mode === 'stitch' ? <CanvasControls /> : <CropControls />}
      </div>
      <div className="ml-auto">
        <ExportDialog />
      </div>
    </div>
  )
}
