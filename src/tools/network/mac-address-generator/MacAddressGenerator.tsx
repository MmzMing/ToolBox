import { RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SpanCopyable } from '@/components/copyable/span-copyable'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { generateMacs, MAC_COUNT_RANGE, type MacSeparator } from './mac-address-generator.service'

export default function MacAddressGenerator() {
  const { t } = useTranslation('tools-network')
  const { t: tCommon } = useTranslation('common')

  const [prefix, setPrefix] = useState('')
  const [count, setCount] = useState(5)
  const [separator, setSeparator] = useState<MacSeparator>(':')
  const [uppercase, setUppercase] = useState(true)
  const [macs, setMacs] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const handleGenerate = () => {
    try {
      setMacs(generateMacs({ count, prefix, separator, uppercase }))
      setError(null)
    } catch (err) {
      setMacs([])
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="flex w-44 flex-col gap-2">
          <Label htmlFor="mac-prefix">{t('mac-address-generator.prefixLabel')}</Label>
          <Input
            id="mac-prefix"
            value={prefix}
            onChange={(event) => setPrefix(event.target.value)}
            placeholder={t('mac-address-generator.prefixPlaceholder')}
            className="font-mono text-sm"
          />
        </div>
        <div className="flex w-28 flex-col gap-2">
          <Label htmlFor="mac-count">{tCommon('generateCount')}</Label>
          <Input
            id="mac-count"
            type="number"
            min={MAC_COUNT_RANGE.min}
            max={MAC_COUNT_RANGE.max}
            value={count}
            onChange={(event) => setCount(Number(event.target.value) || MAC_COUNT_RANGE.min)}
          />
        </div>
        <div className="flex w-40 flex-col gap-2">
          <Label>{t('mac-address-generator.separatorLabel')}</Label>
          <Select
            value={separator === '' ? 'none' : separator}
            onValueChange={(value) => setSeparator(value === 'none' ? '' : (value as MacSeparator))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value=":">{t('mac-address-generator.separator-colon')}</SelectItem>
              <SelectItem value="-">{t('mac-address-generator.separator-dash')}</SelectItem>
              <SelectItem value="none">{t('mac-address-generator.separator-none')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2 pb-1">
          <Switch id="mac-uppercase" checked={uppercase} onCheckedChange={setUppercase} />
          <Label htmlFor="mac-uppercase">{t('mac-address-generator.uppercaseLabel')}</Label>
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

      {macs.length > 0 && (
        <div className="flex flex-col gap-2">
          <Label>{t('mac-address-generator.generatedList')}</Label>
          <div className="flex flex-wrap gap-2">
            {macs.map((mac) => (
              <SpanCopyable key={mac} value={mac} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
