import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { TextareaCopyable } from '@/components/copyable/textarea-copyable'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ipv4RangeToCidrs } from './ipv4-range-expander.service'

export default function Ipv4RangeExpander() {
  const { t } = useTranslation('tools-network')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')

  const result = useMemo<{ value: string[] | null; error: string | null }>(() => {
    if (start.trim() === '' && end.trim() === '') {
      return { value: null, error: null }
    }
    try {
      return { value: ipv4RangeToCidrs(start, end), error: null }
    } catch (err) {
      return { value: null, error: err instanceof Error ? err.message : String(err) }
    }
  }, [start, end])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor="range-start">{t('ipv4-range-expander.startLabel')}</Label>
          <Input
            id="range-start"
            value={start}
            onChange={(event) => setStart(event.target.value)}
            placeholder="192.168.1.1"
            className="font-mono text-sm"
          />
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor="range-end">{t('ipv4-range-expander.endLabel')}</Label>
          <Input
            id="range-end"
            value={end}
            onChange={(event) => setEnd(event.target.value)}
            placeholder="192.168.1.10"
            className="font-mono text-sm"
          />
        </div>
      </div>

      {result.error && (
        <Alert variant="destructive">
          <AlertDescription>{result.error}</AlertDescription>
        </Alert>
      )}

      {result.value && (
        <div className="flex flex-col gap-2">
          <Label>
            {t('ipv4-range-expander.cidrList')} ·{' '}
            {t('ipv4-range-expander.cidrCount', { count: result.value.length })}
          </Label>
          <TextareaCopyable
            value={result.value.join('\n')}
            rows={Math.min(result.value.length + 1, 10)}
          />
        </div>
      )}
    </div>
  )
}
