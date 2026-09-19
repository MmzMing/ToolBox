import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { InputCopyable } from '@/components/copyable/input-copyable'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  convertTemperature,
  temperatureUnits,
  type TemperatureUnit,
} from './temperature-converter.service'

export default function TemperatureConverter() {
  const { t } = useTranslation('tools-measurement')

  const [input, setInput] = useState('25')
  const [from, setFrom] = useState<TemperatureUnit>('C')

  const parsed = Number(input)
  const isValid = input.trim() !== '' && Number.isFinite(parsed)

  const result = useMemo(() => {
    if (!isValid) {
      return null
    }
    try {
      return convertTemperature(parsed, from)
    } catch {
      return null
    }
  }, [isValid, parsed, from])

  const rows = [
    { unit: 'C' as const, label: t('temperature-converter.celsiusLabel') },
    { unit: 'F' as const, label: t('temperature-converter.fahrenheitLabel') },
    { unit: 'K' as const, label: t('temperature-converter.kelvinLabel') },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="temperature-value">{t('temperature-converter.valueLabel')}</Label>
          <Input
            id="temperature-value"
            type="number"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="25"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label>{t('temperature-converter.unitLabel')}</Label>
          <Select value={from} onValueChange={(value) => setFrom(value as TemperatureUnit)}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {temperatureUnits.map((unit) => (
                <SelectItem key={unit} value={unit}>
                  {t(`temperature-converter.unit-${unit}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {result === null && input.trim() !== '' && (
        <Alert variant="destructive">
          <AlertDescription>{t('temperature-converter.invalidValue')}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-3">
        {rows.map((row) => (
          <div key={row.unit} className="flex flex-col gap-2">
            <Label>{row.label}</Label>
            <InputCopyable value={result === null ? '' : String(result[row.unit])} readOnly />
          </div>
        ))}
      </div>
    </div>
  )
}
