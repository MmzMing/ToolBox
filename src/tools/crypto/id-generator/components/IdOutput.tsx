import type { ReactNode } from 'react'

import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { TextareaCopyable } from '@/components/copyable/textarea-copyable'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

import type { IdFormat, IdJoin } from '../id-format.service'

import { ID_JOINS, UUID_FORMATS, renderIds } from '../id-format.service'

const MIN_ROWS = 6
const MAX_ROWS = 20

type ToolbarFieldProps = {
  label: string
  htmlFor?: string
  className?: string
  children: ReactNode
}

/** 工具栏里的一格：标签在上、控件在下，宽度由外部 className 决定 */
export function ToolbarField({ label, htmlFor, className, children }: ToolbarFieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={htmlFor} className="text-muted-foreground text-xs">
        {label}
      </Label>
      {children}
    </div>
  )
}

type SelectorProps<T extends string> = {
  id: string
  label: string
  className?: string
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
}

function Selector<T extends string>({
  id,
  label,
  className,
  value,
  options,
  onChange,
}: SelectorProps<T>) {
  return (
    <ToolbarField label={label} htmlFor={id} className={className}>
      <Select value={value} onValueChange={(next) => onChange(next as T)}>
        <SelectTrigger id={id}>
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
    </ToolbarField>
  )
}

type IdOutputProps = {
  values: readonly string[]
  /** ULID 定长无分隔符，只该给出大小写两项，别让它假装支持 URN */
  formats?: readonly IdFormat[]
  /** 工具栏下方的一行说明，如所选版本的适用场景 */
  hint?: string
  /** 面板专属参数控件，与格式 / 拼接共用同一条工具栏 */
  children?: ReactNode
  /** 工具栏末尾的主操作按钮 */
  action?: ReactNode
}

/** 生成结果区：一条工具栏（参数 + 格式 + 拼接 + 生成）配一个只读 textarea 整块复制 */
export function IdOutput({
  values,
  formats = UUID_FORMATS,
  hint,
  children,
  action,
}: IdOutputProps) {
  const { t } = useTranslation('tools-crypto', { keyPrefix: 'id-generator' })
  const [format, setFormat] = useState<IdFormat>('default')
  const [join, setJoin] = useState<IdJoin>('newline')

  const text = useMemo(() => renderIds(values, format, join), [values, format, join])
  const rows = Math.min(MAX_ROWS, Math.max(MIN_ROWS, values.length))

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        {children}
        <Selector
          id="id-output-format"
          label={t('output-format')}
          className="w-40"
          value={format}
          onChange={setFormat}
          options={formats.map((value) => ({ value, label: t(`format.${value}`) }))}
        />
        <Selector
          id="id-output-join"
          label={t('join-label')}
          className="w-40"
          value={join}
          onChange={setJoin}
          options={ID_JOINS.map((value) => ({ value, label: t(`join.${value}`) }))}
        />
        {action}
      </div>

      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}

      <TextareaCopyable value={text} rows={rows} className="font-mono" />

      <p className="text-muted-foreground text-xs">
        {t('id-count-hint', { total: values.length })}
      </p>
    </div>
  )
}
