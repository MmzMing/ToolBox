import { Slash } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { PanelField, PanelSection, PanelSliderField } from '@/components/panel-fields'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { MAX_GAP, MAX_PADDING, MAX_RADIUS } from '../image-stack.service'
import { useImageStackStore } from '../store'

/** 常用背景色：属于用户数据而不是主题色，就地写死 */
const SWATCHES = ['#ffffff', '#000000', '#2563eb', '#22c55e', '#f97316', '#fde68a'] as const

/** 拼接成品的样式：边距、间距、两处圆角与背景 */
export function StylePanel() {
  const { t } = useTranslation('tools-images', { keyPrefix: 'image-stack' })
  const style = useImageStackStore((state) => state.style)
  const setStyle = useImageStackStore((state) => state.setStyle)
  const isColor = style.background.type === 'color'
  // 直接在表达式里判类型，抽成布尔量 TS 就窄化不了联合类型了
  const color = style.background.type === 'color' ? style.background.value : '#ffffff'

  return (
    <PanelSection title={t('style.title')}>
      <PanelSliderField
        label={t('style.padding')}
        value={style.padding}
        onChange={(value) => setStyle({ padding: value })}
        min={0}
        max={MAX_PADDING}
        format={(value) => `${value} px`}
      />
      <PanelSliderField
        label={t('style.gap')}
        value={style.gap}
        onChange={(value) => setStyle({ gap: value })}
        min={0}
        max={MAX_GAP}
        format={(value) => `${value} px`}
      />
      <PanelSliderField
        label={t('style.cellRadius')}
        value={style.cellRadius}
        onChange={(value) => setStyle({ cellRadius: value })}
        min={0}
        max={MAX_RADIUS}
        format={(value) => `${value} px`}
      />
      <PanelSliderField
        label={t('style.canvasRadius')}
        value={style.canvasRadius}
        onChange={(value) => setStyle({ canvasRadius: value })}
        min={0}
        max={MAX_RADIUS}
        format={(value) => `${value} px · ${t('style.canvasRadiusHint')}`}
      />

      <PanelField label={t('style.background')} span={2}>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-label={t('style.transparent')}
            title={t('style.transparent')}
            aria-pressed={!isColor}
            onClick={() => setStyle({ background: { type: 'transparent' } })}
            className={cn(
              'border-border text-muted-foreground flex size-7 cursor-pointer items-center justify-center rounded-md border bg-transparent transition-transform hover:scale-110',
              !isColor && 'ring-primary ring-2',
            )}
          >
            <Slash className="size-3.5" />
          </button>

          <Separator orientation="vertical" className="h-5" />

          {SWATCHES.map((swatch) => (
            <button
              key={swatch}
              type="button"
              aria-label={swatch}
              title={swatch}
              aria-pressed={isColor && swatch.toLowerCase() === color.toLowerCase()}
              onClick={() => setStyle({ background: { type: 'color', value: swatch } })}
              className={cn(
                'border-border size-7 cursor-pointer rounded-md border transition-transform hover:scale-110',
                isColor && swatch.toLowerCase() === color.toLowerCase() && 'ring-primary ring-2',
              )}
              style={{ backgroundColor: swatch }}
            />
          ))}

          <label className="ml-auto flex items-center gap-1.5">
            <span className="sr-only">{t('style.pickColor')}</span>
            <input
              type="color"
              value={color}
              aria-label={t('style.pickColor')}
              onChange={(event) =>
                setStyle({ background: { type: 'color', value: event.target.value } })
              }
              className="border-border size-7 cursor-pointer rounded-md border bg-transparent p-0.5"
            />
            <span className="text-muted-foreground font-mono text-xs uppercase">{color}</span>
          </label>
        </div>
      </PanelField>
    </PanelSection>
  )
}
