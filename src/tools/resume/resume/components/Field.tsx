import { useTranslation } from 'react-i18next'
import { Wand2 } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { DateRangePicker } from '@/components/date-range-picker'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

import { DateField } from './DateField'
import { RichEditor } from './rich-editor/RichEditor'
import { AIPolishDialog } from './ai/AIPolishDialog'
import { useAIGate } from './ai/useAIGate'
import {
  fromPickerMonth,
  isPresentValue,
  joinDateRange,
  splitDateRange,
  toPickerDate,
} from '../resume.service'

export type FieldType = 'text' | 'textarea' | 'date' | 'date-range' | 'editor'

type FieldProps = {
  label?: string
  value: string
  onChange: (value: string) => void
  type?: FieldType
  placeholder?: string
  required?: boolean
  className?: string
  /** 结束日期一侧显示「至今」开关 */
  showPresentSwitch?: boolean
}

const inputClass = 'w-full'

/** 表单里的多态输入：文本 / 多行 / 单日期 / 日期区间 / 富文本 */
export function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  required,
  className,
  showPresentSwitch,
}: FieldProps) {
  const { t } = useTranslation('tools-resume')
  const present = t('resume.present')
  const isPresent = isPresentValue(value)
  const { model: textModel } = useAIGate('text')
  const [polishOpen, setPolishOpen] = useState(false)

  /** 总开关关掉时连按钮都不渲染；开了但没配模型时点了是把配置弹窗拉起来 */
  const polish = textModel ? (
    <div className="mb-1.5 flex justify-end">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setPolishOpen(true)}
        className="gap-1.5"
      >
        <Wand2 className="size-4" />
        {t('resume.ai.polish.entry')}
      </Button>
    </div>
  ) : null

  const renderLabel = () => {
    if (!label) {
      return null
    }

    return (
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <Label className="text-sm font-medium">{label}</Label>
        {showPresentSwitch && (
          <div className="flex items-center gap-2">
            <Switch
              checked={isPresent}
              onCheckedChange={(checked) => {
                if (type === 'date') {
                  onChange(checked ? present : '')
                  return
                }
                const { start } = splitDateRange(value)
                onChange(checked ? joinDateRange(start, present) : start)
              }}
            />
            <span className="text-muted-foreground text-xs">{present}</span>
          </div>
        )}
      </div>
    )
  }

  if (type === 'date') {
    return (
      <div className={className}>
        {renderLabel()}
        <DateField
          value={isPresent ? '' : value}
          onChange={onChange}
          placeholder={placeholder}
          disabled={isPresent}
          ariaLabel={label}
        />
      </div>
    )
  }

  if (type === 'date-range') {
    const { start, end } = splitDateRange(value)
    const from = toPickerDate(start)
    const to = toPickerDate(end)
    // 只填了开始日期是合法状态（结束未知），不能被区间面板补成整月
    const oneSided = Boolean(from) && !to

    return (
      <div className={className}>
        {renderLabel()}
        <DateRangePicker
          months={1}
          presets="none"
          granularity="month"
          value={from ? { start: from, end: to ?? from } : null}
          label={label}
          placeholder={placeholder}
          onChange={(range) => {
            const nextStart = fromPickerMonth(range.start)
            const nextEnd = fromPickerMonth(range.end)
            if (isPresent) {
              onChange(joinDateRange(nextStart, present))
              return
            }
            onChange(
              oneSided && nextStart === nextEnd ? nextStart : joinDateRange(nextStart, nextEnd),
            )
          }}
        />
      </div>
    )
  }

  if (type === 'textarea') {
    return (
      <div className={className}>
        {renderLabel()}
        <Textarea
          rows={4}
          value={value}
          required={required}
          placeholder={placeholder}
          className={inputClass}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    )
  }

  if (type === 'editor') {
    return (
      <div className={className}>
        {renderLabel()}
        {polish}
        <RichEditor content={value} placeholder={placeholder} onChange={onChange} />
        {textModel && (
          <AIPolishDialog
            open={polishOpen}
            onOpenChange={setPolishOpen}
            content={value}
            model={textModel}
            onApply={onChange}
          />
        )}
      </div>
    )
  }

  return (
    <div className={className}>
      {renderLabel()}
      <Input
        value={value}
        required={required}
        placeholder={placeholder}
        className={cn(inputClass)}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}
