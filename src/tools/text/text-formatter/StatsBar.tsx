import { BarChart3 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { statKeys, type TextStats } from './text-formatter.service'
import type { CaretPosition } from '@/utils/text-caret'

interface StatsBarProps {
  stats: TextStats
  /** 输出卡是只读 pre，没有光标，故不传 */
  caret?: CaretPosition
  /** 状态条所属区域，用于无障碍标签 */
  side: 'input' | 'output'
}

/**
 * 卡片底部状态条：行列与字符数常驻，点击计数块展开完整文本统计。
 * 统计口径与指标定义都在 service 的 analyzeText，这里只负责呈现。
 */
export function StatsBar({ stats, caret, side }: StatsBarProps) {
  const { t } = useTranslation('tools-text')
  // 行列与字符数在通用组件里也用同一套文案，避免两处各写一份
  const { t: tCommon } = useTranslation('common')

  const statValue = (key: (typeof statKeys)[number]): string =>
    key === 'readingMinutes'
      ? t('text-formatter.stats.readingMinutesValue', { minutes: stats.readingMinutes })
      : String(stats[key])

  return (
    <div className="flex w-full items-center justify-between gap-2">
      <span className="text-muted-foreground tabular-nums">
        {caret ? tCommon('caretPosition', { line: caret.line, column: caret.column }) : '\u00a0'}
      </span>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="text-muted-foreground hover:text-foreground gap-1 tabular-nums"
            aria-label={t('text-formatter.status.openStats', {
              side: t(`text-formatter.${side}Label`),
            })}
          >
            <BarChart3 />
            {tCommon('charsAndLines', { chars: stats.chars, lines: stats.lines })}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 gap-0 p-0">
          <p className="border-border border-b px-3 py-2 text-sm font-medium">
            {t('text-formatter.stats.title')}
          </p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 p-3">
            {statKeys.map((key) => (
              <div key={key} className="flex min-w-0 items-baseline justify-between gap-2 text-xs">
                <dt className="text-muted-foreground truncate">
                  {t(`text-formatter.stats.${key}`)}
                </dt>
                <dd className="font-medium tabular-nums">{statValue(key)}</dd>
              </div>
            ))}
          </dl>
        </PopoverContent>
      </Popover>
    </div>
  )
}
