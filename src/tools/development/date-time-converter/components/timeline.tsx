import { useTranslation } from 'react-i18next'

import { SpanCopyable } from '@/components/copyable/span-copyable'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

import { diffParts, type TimeField, type TimestampUnit } from '../batch-extract.service'

/** 轨道几何：圆点直径 10px 贴在左边，竖线取圆心所在的 5px 处 */
const RAIL_LINE = 'left-[5px] w-px'

interface TimelineProps {
  fields: readonly TimeField[]
  /** 按时间排序时才标首尾并给间隔：按字段排序时相邻两条可能相隔数年 */
  orderedByTime: boolean
  /** 结构化模式下路径来自字段名，纯文本模式可能取不到键名 */
  fromStructured: boolean
}

/**
 * 纵向时间轴卡片流：一条连续轨道串起所有时间点，卡片落在轨道右侧。
 *
 * 与「树状缩进列表」的取舍：树状列表保住层级，但同一层里几十个时间戳挤在一起时
 * 看不出先后节奏；这里把顺序交给轨道与间隔标签，层级只留在字段路径文本里。
 */
export function Timeline({ fields, orderedByTime, fromStructured }: TimelineProps) {
  const { t } = useTranslation('tools-development', { keyPrefix: 'date-time-converter.extract' })

  const labelOf = (field: TimeField) =>
    field.path === '' ? t('lineNo', { line: field.line ?? 1 }) : field.path
  const unitOf = (unit: TimestampUnit | null) =>
    unit === null ? t('kindIso') : t(`unit${unit.toUpperCase()}`)
  const durationOf = (ms: number) =>
    diffParts(ms)
      .map((part) => `${part.value}${t(part.unit)}`)
      .join(' ')

  return (
    <ol className="flex flex-col">
      {fields.map((field, index) => {
        const previous = index === 0 ? undefined : fields[index - 1]
        const isLast = index === fields.length - 1
        const isExtreme = orderedByTime && (index === 0 || isLast)
        const label = labelOf(field)

        return (
          <li key={`${field.path}#${field.raw}#${index}`} className="relative pb-3 pl-7 last:pb-0">
            <span
              aria-hidden="true"
              className={cn('bg-border absolute top-0', RAIL_LINE, isLast ? 'h-6' : 'bottom-0')}
            />
            <span
              aria-hidden="true"
              className={cn(
                'border-primary absolute top-[17px] left-0 size-2.5 rounded-full border-2',
                isExtreme ? 'bg-primary' : 'bg-background',
              )}
            />

            <div className="bg-card hover:border-primary/50 rounded-lg border p-3 transition-colors">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="min-w-0 flex-1 truncate font-mono text-sm" title={label}>
                  {label}
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  {isExtreme && (
                    <Badge variant="default">{index === 0 ? t('earliest') : t('latest')}</Badge>
                  )}
                  <Badge variant="secondary">{unitOf(field.unit)}</Badge>
                  {fromStructured && !field.named && (
                    <Badge variant="outline" title={t('suspectHint')}>
                      {t('suspect')}
                    </Badge>
                  )}
                </span>
              </div>

              <p className="mt-1.5 flex items-baseline gap-2 text-sm font-medium tabular-nums">
                {field.local}
                {orderedByTime && previous && (
                  <span className="text-muted-foreground text-[11px] font-normal">
                    +{durationOf(field.ms - previous.ms)}
                  </span>
                )}
              </p>

              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <SpanCopyable value={field.raw} />
                <SpanCopyable value={field.iso} className="max-w-72" />
              </div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
