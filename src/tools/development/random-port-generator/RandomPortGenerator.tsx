import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SpanCopyable } from '@/components/copyable/span-copyable'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { generatePorts, parseExcludeList } from './random-port-generator.service'

const DEFAULT_COUNT = 10
const DEFAULT_MIN = 1024
const DEFAULT_MAX = 65535
const MAX_COUNT = 100

export default function RandomPortGenerator() {
  const { t } = useTranslation('tools-development')
  const { t: tCommon } = useTranslation('common')

  const [count, setCount] = useState(DEFAULT_COUNT)
  const [min, setMin] = useState(DEFAULT_MIN)
  const [max, setMax] = useState(DEFAULT_MAX)
  const [excludeInput, setExcludeInput] = useState('')
  const [ports, setPorts] = useState<number[]>([])
  const [error, setError] = useState<string | null>(null)

  const handleGenerate = () => {
    try {
      setPorts(generatePorts({ count, min, max, exclude: parseExcludeList(excludeInput) }))
      setError(null)
    } catch (err) {
      setPorts([])
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleClear = () => {
    setPorts([])
    setError(null)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="port-count">{tCommon('generateCount')}</Label>
          <Input
            id="port-count"
            type="number"
            min={1}
            max={MAX_COUNT}
            value={count}
            onChange={(event) => setCount(event.target.valueAsNumber)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="port-min">{t('random-port-generator.rangeLabel')}</Label>
          <div className="flex items-center gap-2">
            <Input
              id="port-min"
              type="number"
              value={min}
              onChange={(event) => setMin(event.target.valueAsNumber)}
              placeholder="1024"
            />
            <span className="text-muted-foreground">–</span>
            <Input
              aria-label="max"
              type="number"
              value={max}
              onChange={(event) => setMax(event.target.valueAsNumber)}
              placeholder="65535"
            />
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="port-exclude">{t('random-port-generator.excludeLabel')}</Label>
          <Input
            id="port-exclude"
            value={excludeInput}
            onChange={(event) => setExcludeInput(event.target.value)}
            placeholder={t('random-port-generator.excludePlaceholder')}
            className="font-mono"
          />
        </div>
      </div>

      <div className="flex gap-2">
        <Button type="button" onClick={handleGenerate}>
          {tCommon('generate')}
        </Button>
        <Button type="button" variant="outline" onClick={handleClear}>
          {tCommon('clear')}
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-2">
        <Label className="text-muted-foreground">{t('random-port-generator.portsLabel')}</Label>
        {ports.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('random-port-generator.portsEmpty')}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {ports.map((port) => (
              <SpanCopyable key={port} value={String(port)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
