import type { ReactNode } from 'react'
import { useId } from 'react'
import { ChevronDown } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'

/**
 * 右侧操作栏的统一控件语言：一整块被细线分段的可折叠面板，标签在上、控件撑满整格、
 * 说明落在控件下方。单位写进标签括号（`边距(px)`），输入框就不会被后缀挤窄。
 * 段内是两列网格，跨两列用 `span: 2`；窄栏里两列各占一半，宽栏里也不会拉成一条河。
 */
const HINT = 'text-muted-foreground text-xs leading-tight'
const SPAN2 = 'col-span-2'

export function PanelGroup({ className, children }: { className?: string; children: ReactNode }) {
  return <Card className={cn('gap-0 divide-y p-0', className)}>{children}</Card>
}

export function PanelSection({
  title,
  children,
  defaultOpen = true,
}: {
  title: string
  children: ReactNode
  defaultOpen?: boolean
}) {
  return (
    <Collapsible defaultOpen={defaultOpen} asChild>
      <section className="group flex flex-col p-4">
        <CollapsibleTrigger className="flex w-full items-center justify-between gap-2">
          <span className="text-sm font-semibold">{title}</span>
          <ChevronDown className="text-muted-foreground size-4 transition-transform group-data-[state=closed]:-rotate-90" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-3 grid grid-cols-2 gap-3">{children}</div>
        </CollapsibleContent>
      </section>
    </Collapsible>
  )
}

/** 段内需要自己控制跨列的自定义控件（色板、上传区、滑块）用这个壳 */
export function PanelField({
  label,
  hint,
  span = 1,
  htmlFor,
  children,
}: {
  label: string
  hint?: string
  span?: 1 | 2
  htmlFor?: string
  children: ReactNode
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', span === 2 && SPAN2)}>
      <Label htmlFor={htmlFor} className="text-xs">
        {label}
      </Label>
      {children}
      {hint && <p className={HINT}>{hint}</p>}
    </div>
  )
}

type FieldProps = { label: string; hint?: string; span?: 1 | 2 }

export function PanelNumberField({
  label,
  value,
  onChange,
  hint,
  placeholder,
  min,
  max,
  step = 1,
  disabled,
  span = 1,
}: FieldProps & {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  min?: number
  max?: number
  step?: number
  disabled?: boolean
}) {
  const id = useId()
  return (
    <PanelField label={label} hint={hint} span={span} htmlFor={id}>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        value={value}
        placeholder={placeholder}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="text-right font-mono"
      />
    </PanelField>
  )
}

export function PanelTextField({
  label,
  value,
  onChange,
  hint,
  placeholder,
  disabled,
  type = 'text',
  span = 1,
}: FieldProps & {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  type?: 'text' | 'password'
}) {
  const id = useId()
  return (
    <PanelField label={label} hint={hint} span={span} htmlFor={id}>
      <Input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </PanelField>
  )
}

export type PanelSelectOption = { value: string; label: string }

export function PanelSelectField({
  label,
  value,
  onChange,
  options,
  hint,
  disabled,
  span = 1,
}: FieldProps & {
  value: string
  onChange: (value: string) => void
  options: readonly PanelSelectOption[]
  disabled?: boolean
}) {
  const id = useId()
  return (
    <PanelField label={label} hint={hint} span={span} htmlFor={id}>
      <Select value={value} disabled={disabled} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </PanelField>
  )
}

/** 开关行：开关在左、标签在右，与「标签在上」的输入框区分开 */
export function PanelSwitchField({
  label,
  hint,
  checked,
  onChange,
  span = 1,
}: FieldProps & {
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  const id = useId()
  return (
    <div className={cn('flex flex-col gap-1.5', span === 2 && SPAN2)}>
      <div className="flex h-9 items-center gap-2">
        <Switch id={id} checked={checked} onCheckedChange={onChange} />
        <Label htmlFor={id} className="text-xs font-normal">
          {label}
        </Label>
      </div>
      {hint && <p className={HINT}>{hint}</p>}
    </div>
  )
}

export function PanelRadioField({
  label,
  value,
  onChange,
  options,
  hint,
  span = 2,
}: FieldProps & {
  value: string
  onChange: (value: string) => void
  options: readonly PanelSelectOption[]
}) {
  return (
    <PanelField label={label} hint={hint} span={span}>
      <RadioGroup
        value={value}
        onValueChange={onChange}
        className="flex w-auto flex-wrap items-center gap-x-4 gap-y-2"
      >
        {options.map((option) => (
          <label key={option.value} className="flex items-center gap-2 text-xs">
            <RadioGroupItem value={option.value} />
            {option.label}
          </label>
        ))}
      </RadioGroup>
    </PanelField>
  )
}

/** 段内小标题（把一组同类控件再分组时用），自动占满整行 */
export function PanelSubHeader({ children }: { children: string }) {
  return <h3 className={cn(HINT, 'font-semibold', SPAN2)}>{children}</h3>
}

/**
 * 滑块的当前值走 hint 而不是标签括号：拖动时数值要跟着跳，
 * 标签里写死单位反而会让「标签（px）」和「提示 256 px」重复一遍。
 */
export function PanelSliderField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  format,
  span = 1,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  step?: number
  format?: (value: number) => string
  span?: 1 | 2
}) {
  const id = useId()
  return (
    <PanelField label={label} span={span} htmlFor={id} hint={format ? format(value) : undefined}>
      <Slider
        id={id}
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={(values) => onChange(values[0] ?? value)}
      />
    </PanelField>
  )
}
