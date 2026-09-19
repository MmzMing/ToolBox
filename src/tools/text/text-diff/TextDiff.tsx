import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { buildDiffRows, diffStats, type DiffRowType } from './text-diff.service'

const ROW_STYLES: Record<DiffRowType, string> = {
  added: 'bg-primary/10',
  removed: 'bg-destructive/10',
  unchanged: '',
}

const ROW_PREFIXES: Record<DiffRowType, string> = {
  added: '+',
  removed: '−',
  unchanged: ' ',
}

const ROW_TYPE_KEYS: Record<DiffRowType, string> = {
  added: 'text-diff.type-added',
  removed: 'text-diff.type-removed',
  unchanged: 'text-diff.type-unchanged',
}

export default function TextDiff() {
  const { t } = useTranslation('tools-text')

  const [original, setOriginal] = useState('')
  const [modified, setModified] = useState('')

  const rows = useMemo(() => buildDiffRows(original, modified), [original, modified])
  const stats = useMemo(() => diffStats(rows), [rows])
  const hasDiff = stats.added > 0 || stats.removed > 0

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="text-diff-original">{t('text-diff.originalLabel')}</Label>
          <Textarea
            id="text-diff-original"
            value={original}
            onChange={(event) => setOriginal(event.target.value)}
            className="min-h-32 font-mono text-sm"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="text-diff-modified">{t('text-diff.modifiedLabel')}</Label>
          <Textarea
            id="text-diff-modified"
            value={modified}
            onChange={(event) => setModified(event.target.value)}
            className="min-h-32 font-mono text-sm"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label>{t('common:output')}</Label>
        <div className="text-muted-foreground flex items-center gap-3 text-sm">
          {hasDiff && (
            <span className="flex items-center gap-1">
              <span className="text-primary font-medium">{ROW_PREFIXES.added}</span>
              {t(ROW_TYPE_KEYS.added)}
            </span>
          )}
          {hasDiff && (
            <span className="flex items-center gap-1">
              <span className="text-destructive font-medium">{ROW_PREFIXES.removed}</span>
              {t(ROW_TYPE_KEYS.removed)}
            </span>
          )}
          <span className="tabular-nums">
            {t('text-diff.statsSummary', { added: stats.added, removed: stats.removed })}
          </span>
        </div>
      </div>

      <div className="bg-muted/40 overflow-hidden rounded-lg border">
        <div className="max-h-96 overflow-auto p-3 font-mono text-sm leading-relaxed">
          {rows.map((row, index) => (
            <div
              key={index}
              aria-label={t(ROW_TYPE_KEYS[row.type])}
              className={cn('flex gap-2 break-all whitespace-pre-wrap', ROW_STYLES[row.type])}
            >
              <span
                className={cn(
                  'w-4 shrink-0 text-center select-none',
                  row.type === 'added' && 'text-primary',
                  row.type === 'removed' && 'text-destructive',
                )}
              >
                {ROW_PREFIXES[row.type]}
              </span>
              <span className="flex-1">{row.text}</span>
            </div>
          ))}
          {!hasDiff && <p className="text-muted-foreground text-sm">{t('text-diff.noDiff')}</p>}
        </div>
      </div>
    </div>
  )
}
