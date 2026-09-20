import { useState } from 'react'
import { CalendarIcon, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

import { parseDisplayDate, toStoredMonth } from '../resume.service'

type DateFieldProps = {
  /** 存储用的显示串，形如 `2021/07` */
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  ariaLabel?: string
}

/**
 * 月粒度日期选择。
 *
 * 替代旧项目的 HeroUI `DateInput`：简历日期本质上仍是自由显示串，所以只在写入时
 * 归一成 `YYYY/MM`，读取时容忍 `.` `/` `-` 等历史写法，不做任何强校验。
 */
export function DateField({ value, onChange, placeholder, disabled, ariaLabel }: DateFieldProps) {
  const { t } = useTranslation('tools-resume')
  const [open, setOpen] = useState(false)
  const parsed = parseDisplayDate(value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          aria-label={ariaLabel}
          className={cn(
            'w-full justify-between px-3 text-left font-normal',
            !parsed && 'text-muted-foreground',
          )}
        >
          <span className="truncate">{parsed ? toStoredMonth(parsed) : placeholder}</span>
          <CalendarIcon className="size-4 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          captionLayout="dropdown"
          defaultMonth={parsed ?? new Date()}
          selected={parsed ?? undefined}
          onSelect={(date) => {
            onChange(date ? toStoredMonth(date) : '')
            setOpen(false)
          }}
        />
        {parsed && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full justify-center gap-1.5 rounded-t-none border-t"
            onClick={() => {
              onChange('')
              setOpen(false)
            }}
          >
            <X className="size-4" />
            {t('resume.clearDate')}
          </Button>
        )}
      </PopoverContent>
    </Popover>
  )
}
