'use client'

import { DayPicker } from 'react-day-picker'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type CalendarProps = React.ComponentProps<typeof DayPicker>

const navButton = cn(
  buttonVariants({ variant: 'outline' }),
  'size-7 w-7 p-0 opacity-70 hover:opacity-100',
)

/**
 * 日历面板（react-day-picker v10 的 slot 名带下划线，如 `day_button`）。
 *
 * 简历日期只到月粒度，所以导航用下拉直接选年月，比逐页翻快；
 * 选中的"日"由调用方丢弃（见 DateField）。
 */
export function Calendar({
  className,
  classNames,
  showOutsideDays = false,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      captionLayout="dropdown"
      className={cn('p-3', className)}
      classNames={{
        months: 'flex flex-col sm:flex-row gap-2',
        month: 'flex flex-col gap-4',
        month_caption: 'flex justify-center relative h-7 items-center',
        nav: 'absolute inset-y-0 flex w-full justify-between',
        button_previous: navButton,
        button_next: navButton,
        month_grid: 'w-full border-collapse space-x-1',
        weekdays: 'flex',
        weekday: 'text-muted-foreground rounded-md w-8 font-normal text-[0.8rem]',
        week: 'flex w-full mt-2',
        day: 'relative p-0 text-center text-sm',
        day_button: cn(
          buttonVariants({ variant: 'ghost' }),
          'size-8 p-0 aria-selected:bg-primary aria-selected:text-primary-foreground aria-selected:opacity-100',
        ),
        dropdowns: 'flex items-center gap-1',
        dropdown: 'bg-background border-input focus-visible:ring-ring rounded-md border text-sm',
        caption_label: 'text-sm font-medium',
        today: 'bg-accent text-accent-foreground',
        outside: 'text-muted-foreground opacity-50',
        hidden: 'invisible',
        disabled: 'text-muted-foreground opacity-50',
        selected: 'bg-primary text-primary-foreground',
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, ...rest }) =>
          orientation === 'left' ? (
            <ChevronLeft aria-hidden {...rest} />
          ) : (
            <ChevronRight aria-hidden {...rest} />
          ),
      }}
      {...props}
    />
  )
}
