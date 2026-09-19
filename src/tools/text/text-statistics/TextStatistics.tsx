import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Textarea } from '@/components/ui/textarea'
import { analyzeText, type TextStats } from './text-statistics.service'

/** 统计卡片展示顺序（键对应 i18n `stat-<key>`） */
const STAT_KEYS = [
  'chars',
  'charsNoSpaces',
  'words',
  'lines',
  'sentences',
  'paragraphs',
  'avgWordLength',
  'readingMinutes',
] as const

type StatKey = (typeof STAT_KEYS)[number]

function statDisplayValue(stats: TextStats, key: StatKey): string {
  return key === 'readingMinutes' ? String(stats.readingMinutes) : String(stats[key])
}

export default function TextStatistics() {
  const { t } = useTranslation('tools-text')

  const [text, setText] = useState('')

  const stats = useMemo(() => analyzeText(text), [text])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={t('common:input')}
          className="min-h-40"
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {STAT_KEYS.map((key) => (
          <div key={key} className="bg-muted/40 rounded-lg border p-3">
            <div className="text-muted-foreground text-xs">{t(`text-statistics.stat-${key}`)}</div>
            <div className="mt-1 truncate text-xl font-semibold tabular-nums">
              {key === 'readingMinutes'
                ? t('text-statistics.readingMinutesValue', { minutes: stats.readingMinutes })
                : statDisplayValue(stats, key)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
