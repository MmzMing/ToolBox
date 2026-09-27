import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

import type { BatchReport, ParseReason, ParsedId } from '../parse.service'

import { analyzeIds, parseId } from '../parse.service'
import { ParseBatch } from './ParseBatch'
import { ParseDetail } from './ParseDetail'

type ViewState =
  | { mode: 'empty' }
  | { mode: 'invalid'; reason: ParseReason }
  | { mode: 'detail'; value: ParsedId }
  | { mode: 'batch'; report: BatchReport }

/** 认任意包装：横线、无横线、大括号、urn:uuid:、大小写混用、ULID */
export function ParsePanel() {
  const { t } = useTranslation('tools-crypto', { keyPrefix: 'id-generator' })
  const [text, setText] = useState('')

  const view = useMemo<ViewState>(() => {
    const report = analyzeIds(text)
    if (report.total === 0) {
      return { mode: 'empty' }
    }
    if (report.total > 1) {
      return { mode: 'batch', report }
    }
    const [first] = report.lines
    const outcome = parseId(first.raw)
    return outcome.ok
      ? { mode: 'detail', value: outcome.value }
      : { mode: 'invalid', reason: outcome.reason }
  }, [text])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="id-parse-input">{t('parse.input')}</Label>
        <Textarea
          id="id-parse-input"
          rows={5}
          placeholder="017F22AA-79B0-7CC3-91C4-1566B4E8ADA5"
          value={text}
          onChange={(event) => setText(event.target.value)}
          className="font-mono text-xs"
        />
        <p className="text-muted-foreground text-xs">{t('parse.input-hint')}</p>
      </div>

      {view.mode === 'detail' && <ParseDetail value={view.value} />}

      {view.mode === 'batch' && <ParseBatch report={view.report} />}

      {view.mode === 'invalid' && (
        <Alert variant="destructive">
          <AlertDescription>{t(`parse.error-${view.reason}`)}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}
