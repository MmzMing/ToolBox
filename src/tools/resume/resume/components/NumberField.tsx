import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Input } from '@/components/ui/input'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ReactNode } from 'react'

type NumberFieldProps = {
  label: ReactNode
  value: number
  min: number
  max: number
  step?: number
  unit?: string
  onValueChange: (value: number) => void
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/**
 * 滑杆 + 数字框（带 ▲▼ 步进）的组合控件。
 *
 * 旧实现把这套东西按字段复制了三遍约 270 行；页边距、章节间距、段距共用此组件即可。
 */
export function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  unit = 'px',
  onValueChange,
}: NumberFieldProps) {
  const { t } = useTranslation('tools-resume')

  const commit = (next: number) => {
    if (Number.isFinite(next)) {
      onValueChange(clamp(next, min, max))
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Label className="text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-4">
        <Slider
          className="flex-1"
          value={[value]}
          min={min}
          max={max}
          step={step}
          onValueChange={([next]) => onValueChange(next)}
        />
        <div className="border-input bg-background flex h-8 w-24 shrink-0 overflow-hidden rounded-md border">
          <Input
            type="number"
            aria-label={String(label)}
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(event) => commit(Number(event.target.value))}
            // 原生步进按钮与右侧自绘的 ▲▼ 重复，且会挤掉数字：一律藏掉，只留自绘那组
            className="no-spinner h-full min-w-0 flex-1 border-0 px-1 text-center tabular-nums focus-visible:ring-0 focus-visible:ring-offset-0"
          />
          <div className="border-input flex flex-col border-l">
            <button
              type="button"
              aria-label={t('resume.increase')}
              className="hover:bg-accent text-muted-foreground flex h-4 w-8 items-center justify-center border-b"
              onClick={() => commit(value + step)}
            >
              <ChevronUp className="size-3" />
            </button>
            <button
              type="button"
              aria-label={t('resume.decrease')}
              className="hover:bg-accent text-muted-foreground flex h-4 w-8 items-center justify-center"
              onClick={() => commit(value - step)}
            >
              <ChevronDown className="size-3" />
            </button>
          </div>
        </div>
        <span className="text-muted-foreground w-6 shrink-0 text-sm">{unit}</span>
      </div>
    </div>
  )
}
