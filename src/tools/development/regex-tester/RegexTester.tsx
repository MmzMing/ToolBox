import { Fragment, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { testRegex, type RegexMatch } from './regex-tester.service'

const FLAG_KEYS = ['g', 'i', 'm', 's', 'u'] as const

interface Segment {
  text: string
  matchIndex: number | null
  start: number
}

/** 把文本按匹配位置切段（切不了返回 null，如匹配区间重叠的病态情形） */
function buildSegments(text: string, matches: RegexMatch[]): Segment[] | null {
  const segments: Segment[] = []
  let cursor = 0
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index]
    if (match.index < cursor) {
      return null
    }
    if (match.index > cursor) {
      segments.push({ text: text.slice(cursor, match.index), matchIndex: null, start: cursor })
    }
    segments.push({ text: match.value, matchIndex: index, start: match.index })
    cursor = match.index + match.value.length
  }
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), matchIndex: null, start: cursor })
  }
  return segments
}

export default function RegexTester() {
  const { t } = useTranslation('tools-development')
  const [pattern, setPattern] = useState('')
  const [flags, setFlags] = useState<string[]>(['g'])
  const [text, setText] = useState('')

  const { matches, error } = useMemo(
    () => testRegex(pattern, flags.join(''), text),
    [pattern, flags, text],
  )

  const segments = useMemo(
    () => (error === null && matches.length > 0 ? buildSegments(text, matches) : null),
    [error, matches, text],
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="regex-pattern">{t('regex-tester.patternLabel')}</Label>
        <Input
          id="regex-pattern"
          value={pattern}
          onChange={(event) => setPattern(event.target.value)}
          placeholder="\\d+"
          className="font-mono"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>{t('regex-tester.flagsLabel')}</Label>
        <ToggleGroup
          type="multiple"
          value={flags}
          onValueChange={(value) => setFlags(value)}
          variant="outline"
        >
          {FLAG_KEYS.map((flag) => (
            <ToggleGroupItem key={flag} value={flag} className="font-mono">
              {flag}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="regex-text">{t('regex-tester.textLabel')}</Label>
        <Textarea
          id="regex-text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          className="min-h-40 font-mono text-sm"
          placeholder="Lorem ipsum 123"
        />
      </div>

      {error !== null && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {segments !== null && (
        <div className="bg-muted/40 rounded-lg border p-3 font-mono text-sm leading-relaxed break-all whitespace-pre-wrap">
          {segments.map((segment) =>
            segment.matchIndex === null ? (
              <Fragment key={`seg-${segment.start}`}>{segment.text}</Fragment>
            ) : (
              <span
                key={`seg-${segment.start}`}
                className="bg-primary/30 rounded-sm px-0.5"
                title={`#${segment.matchIndex + 1}`}
              >
                {segment.text}
              </span>
            ),
          )}
        </div>
      )}

      <div className="text-sm font-medium">
        {matches.length > 0 ? (
          t('regex-tester.matchCount', { count: matches.length })
        ) : (
          <span className="text-muted-foreground">{t('regex-tester.noMatches')}</span>
        )}
      </div>

      {matches.length > 0 && (
        <div className="flex flex-col gap-2">
          <Label className="text-muted-foreground">{t('regex-tester.matchesLabel')}</Label>
          <div className="flex flex-col gap-1.5">
            {matches.map((match, index) => (
              <div
                key={`${match.index}-${index}`}
                className="flex flex-wrap items-baseline gap-2 text-sm"
              >
                <span className="text-muted-foreground font-mono text-xs">
                  {t('regex-tester.matchIndex', { index: index + 1 })}
                </span>
                <span className="bg-primary/30 rounded-sm px-1 font-mono">{match.value}</span>
                {match.groups.length > 0 ? (
                  <span className="text-muted-foreground font-mono text-xs">
                    [{match.groups.map((group) => group ?? 'null').join(', ')}]
                  </span>
                ) : (
                  <span className="text-muted-foreground text-xs">
                    {t('regex-tester.noGroups')}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
