import { RefreshCw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'

import { ID_COUNT_RANGE, ULID_FORMATS } from '../id-format.service'
import { ULID_MAX_TIMESTAMP, generateUlids, ulidTimestamp } from '../ulid.service'
import { IdOutput, ToolbarField } from './IdOutput'

const DEFAULT_COUNT = 5

/** ULID 页签：时间基准 + 单调递增，结果天生字典序有序 */
export function UlidPanel() {
  const { t } = useTranslation('tools-crypto', { keyPrefix: 'id-generator' })

  const [count, setCount] = useState(DEFAULT_COUNT)
  const [timestampText, setTimestampText] = useState('')
  const [monotonic, setMonotonic] = useState(true)
  const [errorKey, setErrorKey] = useState<string | null>(null)
  const [ids, setIds] = useState<string[]>(() => generateUlids(DEFAULT_COUNT, { monotonic: true }))

  const firstTime = useMemo(() => {
    const head = ids[0]
    if (head === undefined) {
      return ''
    }
    return new Date(ulidTimestamp(head)).toISOString()
  }, [ids])

  const handleGenerate = () => {
    let timestamp: number | undefined
    if (timestampText.trim() !== '') {
      const value = Number(timestampText)
      if (!Number.isInteger(value) || value < 0 || value > ULID_MAX_TIMESTAMP) {
        setErrorKey('error-timestamp')
        return
      }
      timestamp = value
    }

    try {
      setIds(generateUlids(count, { timestamp, monotonic }))
      setErrorKey(null)
    } catch {
      setErrorKey('error-generate')
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {errorKey !== null && (
        <Alert variant="destructive">
          <AlertDescription>{t(errorKey)}</AlertDescription>
        </Alert>
      )}

      <IdOutput
        values={ids}
        formats={ULID_FORMATS}
        hint={`${t('ulid.batch-time', { time: firstTime })}${
          monotonic ? ` · ${t('ulid.monotonic-hint')}` : ''
        }`}
        action={
          <Button onClick={handleGenerate} className="gap-2">
            <RefreshCw className="size-4" />
            {t('generate')}
          </Button>
        }
      >
        <ToolbarField label={t('ulid.count')} htmlFor="ulid-count" className="w-32">
          <Input
            id="ulid-count"
            type="number"
            min={ID_COUNT_RANGE.min}
            max={ID_COUNT_RANGE.max}
            value={count}
            onChange={(event) => {
              const value = Number(event.target.value)
              if (value > 0) {
                setCount(Math.min(ID_COUNT_RANGE.max, Math.floor(value)))
              }
            }}
          />
        </ToolbarField>

        <ToolbarField label={t('ulid.timestamp')} htmlFor="ulid-timestamp" className="w-56">
          <Input
            id="ulid-timestamp"
            type="text"
            inputMode="numeric"
            value={timestampText}
            onChange={(event) => setTimestampText(event.target.value)}
          />
        </ToolbarField>

        <ToolbarField label={t('ulid.monotonic')} htmlFor="ulid-monotonic" className="w-32">
          <div className="flex h-9 items-center">
            <Switch id="ulid-monotonic" checked={monotonic} onCheckedChange={setMonotonic} />
          </div>
        </ToolbarField>
      </IdOutput>
    </div>
  )
}
