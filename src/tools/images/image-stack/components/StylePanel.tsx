import { Slash } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { ParamField } from '@/components/param-field'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Slider } from '@/components/ui/slider'
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
    <Card className="gap-3">
      <CardHeader className="border-border border-b pb-0">
        <CardTitle className="text-sm">{t('style.title')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ParamField label={t('style.padding')} hint={`${style.padding} px`} htmlFor="stack-padding">
          <Slider
            id="stack-padding"
            min={0}
            max={MAX_PADDING}
            step={1}
            value={[style.padding]}
            onValueChange={([value = 0]) => setStyle({ padding: value })}
          />
        </ParamField>

        <ParamField label={t('style.gap')} hint={`${style.gap} px`} htmlFor="stack-gap">
          <Slider
            id="stack-gap"
            min={0}
            max={MAX_GAP}
            step={1}
            value={[style.gap]}
            onValueChange={([value = 0]) => setStyle({ gap: value })}
          />
        </ParamField>

        <ParamField
          label={t('style.cellRadius')}
          hint={`${style.cellRadius} px`}
          htmlFor="stack-cell-radius"
        >
          <Slider
            id="stack-cell-radius"
            min={0}
            max={MAX_RADIUS}
            step={1}
            value={[style.cellRadius]}
            onValueChange={([value = 0]) => setStyle({ cellRadius: value })}
          />
        </ParamField>

        <ParamField
          label={t('style.canvasRadius')}
          hint={`${style.canvasRadius} px · ${t('style.canvasRadiusHint')}`}
          htmlFor="stack-canvas-radius"
        >
          <Slider
            id="stack-canvas-radius"
            min={0}
            max={MAX_RADIUS}
            step={1}
            value={[style.canvasRadius]}
            onValueChange={([value = 0]) => setStyle({ canvasRadius: value })}
          />
        </ParamField>

        <Separator />

        <ParamField label={t('style.background')}>
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
        </ParamField>
      </CardContent>
    </Card>
  )
}
