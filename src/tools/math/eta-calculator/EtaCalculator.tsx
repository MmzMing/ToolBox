import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { InputCopyable } from '@/components/copyable/input-copyable'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { calculateEta, type EtaResult } from './eta-calculator.service'

export default function EtaCalculator() {
  const { t } = useTranslation('tools-math')
  const [done, setDone] = useState('')
  const [total, setTotal] = useState('')
  const [elapsed, setElapsed] = useState('')

  const result = useMemo<{ value: EtaResult | null; error: string | null }>(() => {
    if (done.trim() === '' || total.trim() === '' || elapsed.trim() === '') {
      return { value: null, error: null }
    }
    try {
      return {
        value: calculateEta(Number(done), Number(total), Number(elapsed)),
        error: null,
      }
    } catch (err) {
      return { value: null, error: err instanceof Error ? err.message : String(err) }
    }
  }, [done, total, elapsed])

  const eta = result.value

  const etaTextParts = (etaText: { h: number; m: number; s: number }): string =>
    etaText.h > 0
      ? t('eta-calculator.etaTextLong', etaText)
      : t('eta-calculator.etaTextShort', { m: etaText.m, s: etaText.s })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor="eta-done">{t('eta-calculator.doneLabel')}</Label>
          <Input
            id="eta-done"
            type="number"
            min={0}
            value={done}
            onChange={(event) => setDone(event.target.value)}
            placeholder="35"
          />
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor="eta-total">{t('eta-calculator.totalLabel')}</Label>
          <Input
            id="eta-total"
            type="number"
            min={1}
            value={total}
            onChange={(event) => setTotal(event.target.value)}
            placeholder="100"
          />
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor="eta-elapsed">{t('eta-calculator.elapsedLabel')}</Label>
          <Input
            id="eta-elapsed"
            type="number"
            min={0}
            value={elapsed}
            onChange={(event) => setElapsed(event.target.value)}
            placeholder="120"
          />
        </div>
      </div>

      {result.error && (
        <Alert variant="destructive">
          <AlertDescription>{result.error}</AlertDescription>
        </Alert>
      )}

      {eta && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground w-32 shrink-0 text-sm">
              {t('eta-calculator.percentLabel')}
            </span>
            <InputCopyable value={`${eta.percent}%`} readOnly className="font-mono text-sm" />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground w-32 shrink-0 text-sm">
              {t('eta-calculator.remainingLabel')}
            </span>
            <InputCopyable value={String(eta.remaining)} readOnly className="font-mono text-sm" />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground w-32 shrink-0 text-sm">
              {t('eta-calculator.remainingTimeLabel')}
            </span>
            <InputCopyable
              value={eta.etaText ? etaTextParts(eta.etaText) : t('eta-calculator.unknownEta')}
              readOnly
              className="font-mono text-sm"
            />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground w-32 shrink-0 text-sm">
              {t('eta-calculator.etaTimestampLabel')}
            </span>
            {eta.etaTimestamp === null ? (
              <span className="text-muted-foreground text-sm">
                {t('eta-calculator.unknownEta')}
              </span>
            ) : (
              <InputCopyable
                value={new Date(eta.etaTimestamp).toLocaleString()}
                readOnly
                className="font-mono text-sm"
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
