import { Slash } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { PanelField } from '@/components/panel-fields'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import type { Background } from '../image-stack.service'

/** 常用背景色：属于用户数据而不是主题色，就地写死 */
const SWATCHES = ['#ffffff', '#000000', '#2563eb', '#22c55e', '#f97316', '#fde68a'] as const

/**
 * 背景那一行：透明 + 色板 + 取色器。
 * 拼接与长图两个面板都要，所以从 StylePanel 里抽出来，避免复制一份。
 */
export function BackgroundField({
  value,
  onChange,
}: {
  value: Background
  onChange: (value: Background) => void
}) {
  const { t } = useTranslation('tools-images', { keyPrefix: 'image-stack' })
  // 直接在表达式里判类型，抽成布尔量 TS 就窄化不了联合类型了
  const isColor = value.type === 'color'
  const color = value.type === 'color' ? value.value : '#ffffff'

  return (
    <PanelField label={t('style.background')} span={2}>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-label={t('style.transparent')}
          title={t('style.transparent')}
          aria-pressed={!isColor}
          onClick={() => onChange({ type: 'transparent' })}
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
            onClick={() => onChange({ type: 'color', value: swatch })}
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
            onChange={(event) => onChange({ type: 'color', value: event.target.value })}
            className="border-border size-7 cursor-pointer rounded-md border bg-transparent p-0.5"
          />
          <span className="text-muted-foreground font-mono text-xs uppercase">{color}</span>
        </label>
      </div>
    </PanelField>
  )
}
