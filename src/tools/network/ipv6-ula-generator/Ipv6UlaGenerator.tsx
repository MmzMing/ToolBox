import { RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SpanCopyable } from '@/components/copyable/span-copyable'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { generateIpv6UlaPrefixes, ULA_COUNT_RANGE } from './ipv6-ula-generator.service'

export default function Ipv6UlaGenerator() {
  const { t } = useTranslation('tools-network')
  const { t: tCommon } = useTranslation('common')

  const [count, setCount] = useState(5)
  const [prefixes, setPrefixes] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const handleGenerate = () => {
    try {
      setPrefixes(generateIpv6UlaPrefixes(count))
      setError(null)
    } catch (err) {
      setPrefixes([])
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-sm">{t('ipv6-ula-generator.hint')}</p>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="flex w-32 flex-col gap-2">
          <Label htmlFor="ula-count">{tCommon('generateCount')}</Label>
          <Input
            id="ula-count"
            type="number"
            min={ULA_COUNT_RANGE.min}
            max={ULA_COUNT_RANGE.max}
            value={count}
            onChange={(event) => setCount(Number(event.target.value) || ULA_COUNT_RANGE.min)}
          />
        </div>
        <Button onClick={handleGenerate} className="sm:ml-auto">
          <RefreshCw className="size-4" />
          {tCommon('generate')}
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {prefixes.length > 0 && (
        <div className="flex flex-col gap-2">
          <Label>{t('common:output')}</Label>
          <div className="flex flex-wrap gap-2">
            {prefixes.map((prefix) => (
              <SpanCopyable key={prefix} value={prefix} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
