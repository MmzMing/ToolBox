import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { SpanCopyable } from '@/components/copyable/span-copyable'
import { Textarea } from '@/components/ui/textarea'
import { diffJson, type JsonDiffEntry, type JsonDiffType } from './json-diff.service'

const typeBadges: Record<
  JsonDiffType,
  { symbol: string; variant: 'outline' | 'destructive' | 'secondary' }
> = {
  added: { symbol: '+', variant: 'outline' },
  removed: { symbol: '−', variant: 'destructive' },
  changed: { symbol: '~', variant: 'secondary' },
}

function DiffEntryRow({ entry }: { entry: JsonDiffEntry }) {
  const { t } = useTranslation('tools-web')
  const badge = typeBadges[entry.type]

  return (
    <li className="flex flex-wrap items-center gap-2 rounded-md border px-2 py-1.5">
      <Badge
        variant={badge.variant}
        aria-label={t(`json-diff.type-${entry.type}`)}
        title={t(`json-diff.type-${entry.type}`)}
        className="font-mono"
      >
        {badge.symbol}
      </Badge>
      <SpanCopyable value={entry.path} />
      {entry.type === 'changed' && (
        <span className="flex min-w-0 items-center gap-1.5 text-sm">
          <span className="text-muted-foreground truncate font-mono">{entry.left}</span>
          <span className="text-muted-foreground">→</span>
          <span className="truncate font-mono">{entry.right}</span>
        </span>
      )}
      {entry.type === 'added' && (
        <span className="min-w-0 truncate font-mono text-sm">{entry.right}</span>
      )}
      {entry.type === 'removed' && (
        <span className="text-muted-foreground min-w-0 truncate font-mono text-sm line-through">
          {entry.left}
        </span>
      )}
    </li>
  )
}

export default function JsonDiff() {
  const { t } = useTranslation('tools-web')

  const [jsonA, setJsonA] = useState('')
  const [jsonB, setJsonB] = useState('')

  const result = useMemo<{ entries: JsonDiffEntry[]; error: string | null }>(() => {
    if (jsonA.trim() === '' || jsonB.trim() === '') {
      return { entries: [], error: null }
    }
    try {
      return { entries: diffJson(jsonA, jsonB), error: null }
    } catch (err) {
      return { entries: [], error: err instanceof Error ? err.message : String(err) }
    }
  }, [jsonA, jsonB])

  const hasDiff = result.entries.length > 0

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="json-diff-a">{t('json-diff.jsonALabel')}</Label>
          <Textarea
            id="json-diff-a"
            value={jsonA}
            onChange={(event) => setJsonA(event.target.value)}
            placeholder='{"name":"Ann","tags":["a","b"]}'
            className="min-h-40 font-mono text-sm"
            spellCheck={false}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="json-diff-b">{t('json-diff.jsonBLabel')}</Label>
          <Textarea
            id="json-diff-b"
            value={jsonB}
            onChange={(event) => setJsonB(event.target.value)}
            placeholder='{"name":"Bob","tags":["a","c"]}'
            className="min-h-40 font-mono text-sm"
            spellCheck={false}
          />
        </div>
      </div>

      {result.error && (
        <Alert variant="destructive">
          <AlertDescription>{result.error}</AlertDescription>
        </Alert>
      )}

      {!result.error && jsonA.trim() !== '' && jsonB.trim() !== '' && (
        <div className="flex flex-col gap-2">
          <Label>{t('json-diff.resultLabel')}</Label>
          {hasDiff ? (
            <ul className="flex flex-col gap-1.5">
              {result.entries.map((entry) => (
                <DiffEntryRow key={`${entry.type}-${entry.path}`} entry={entry} />
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">{t('json-diff.noDiff')}</p>
          )}
        </div>
      )}
    </div>
  )
}
