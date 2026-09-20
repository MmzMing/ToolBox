'use client'

import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { DayButton, DayPicker, type DayButtonProps, type DropdownProps } from 'react-day-picker'

import { buttonVariants } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

export type CalendarProps = React.ComponentProps<typeof DayPicker>

const navButton = cn(
  buttonVariants({ variant: 'outline' }),
  'pointer-events-auto size-7 shrink-0 p-0 opacity-70 hover:opacity-100',
)

const dayButton =
  'flex size-8 items-center justify-center rounded-md text-sm font-normal text-inherit outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40'

/**
 * 年月下拉。
 *
 * 用 shadcn Select 顶掉 react-day-picker 默认的原生 `select`：原生列表由系统绘制，
 * 不吃主题的 CSS 变量。`onChange` 仍是 rdp 的 change 处理器，只读 `e.target.value`，
 * 所以补一个最小事件把值交还给它去 `goToMonth`。
 */
function CalendarDropdown({
  options,
  className,
  value,
  onChange,
  disabled,
  ...props
}: DropdownProps) {
  return (
    <Select
      value={String(value ?? '')}
      disabled={disabled}
      onValueChange={(next) =>
        onChange?.({ target: { value: next } } as React.ChangeEvent<HTMLSelectElement>)
      }
    >
      <SelectTrigger
        size="sm"
        aria-label={props['aria-label']}
        className={cn('w-auto gap-1 font-medium', className)}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper">
        {options?.map((option) => (
          <SelectItem key={option.value} value={String(option.value)} disabled={option.disabled}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

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
  captionLayout = 'dropdown',
  components,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      captionLayout={captionLayout}
      className={cn('w-fit p-3', className)}
      classNames={{
        // v10 把 nav 渲染成 months 的直接子节点，靠 months 的 relative 定位到标题行两侧
        months: 'relative flex flex-col gap-2 sm:flex-row',
        month: 'flex flex-col gap-4',
        month_caption: 'flex h-7 items-center justify-center px-8',
        // nav 横跨整行盖在标题之上，中间空档必须放行点击，否则挡住年月下拉
        nav: 'pointer-events-none absolute inset-x-0 top-0 flex h-7 items-center justify-between',
        button_previous: navButton,
        button_next: navButton,
        month_grid: 'w-full border-collapse',
        weekdays: 'flex',
        weekday: 'w-8 rounded-md text-[0.8rem] font-normal text-muted-foreground',
        week: 'mt-2 flex w-full',
        day: 'relative p-0 text-center text-sm',
        day_button: dayButton,
        dropdowns: 'flex items-center gap-1',
        caption_label: 'text-sm font-medium whitespace-nowrap',
        today: 'bg-accent text-accent-foreground',
        outside: 'text-muted-foreground opacity-50',
        hidden: 'invisible',
        disabled: 'text-muted-foreground opacity-50',
        ...classNames,
      }}
      components={{
        Chevron: ({ className: chevronClassName, disabled: _disabled, orientation, ...rest }) => {
          const ChevronIcon =
            orientation === 'left'
              ? ChevronLeft
              : orientation === 'right'
                ? ChevronRight
                : ChevronDown
          return <ChevronIcon aria-hidden className={cn('size-4', chevronClassName)} {...rest} />
        },
        // v10 把 selected 等修饰类挂到 td，button 上只剩静态类，选中态要自己算
        DayButton: ({ className, modifiers, ...rest }: DayButtonProps) => (
          <DayButton
            {...rest}
            modifiers={modifiers}
            className={cn(
              className,
              modifiers.selected && 'bg-primary text-primary-foreground hover:bg-primary',
            )}
          />
        ),
        Dropdown: CalendarDropdown,
        ...components,
      }}
      {...props}
    />
  )
}
