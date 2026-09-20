import { useTranslation } from 'react-i18next'
import { Wand2 } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

import { DateField } from './DateField'
import { RichEditor } from './rich-editor/RichEditor'
import { AIPolishDialog } from './ai/AIPolishDialog'
import { useAIGate } from './ai/useAIGate'
import { isPresentValue, joinDateRange, splitDateRange } from '../resume.service'

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

    return (
      <div className={className}>
        {renderLabel()}
        <div className="flex items-center gap-2">
          {/* DateField 的触发按钮是 w-full + shrink-0，不包一层就会各占满整行把结束日期挤出可视区 */}
          <div className="min-w-0 flex-1">
            <DateField
              value={start}
              ariaLabel={label}
              placeholder={placeholder}
              onChange={(next) => onChange(joinDateRange(next, isPresent ? present : end))}
            />
          </div>
          <span className="text-muted-foreground shrink-0">-</span>
          <div className="min-w-0 flex-1">
            <DateField
              value={isPresent ? '' : end}
              disabled={isPresent}
              ariaLabel={label}
              placeholder={placeholder}
              onChange={(next) => onChange(joinDateRange(start, next))}
            />
          </div>
        </div>
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
