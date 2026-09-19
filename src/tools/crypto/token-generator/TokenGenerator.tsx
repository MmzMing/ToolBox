import { AlertTriangle, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { InputCopyable } from '@/components/copyable/input-copyable'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import {
  TOKEN_COUNT_RANGE,
  TOKEN_LENGTH_RANGE,
  generateTokens,
  type TokenOptions,
} from './token-generator.service'

const DEFAULT_OPTIONS: TokenOptions = {
  length: 16,
  uppercase: true,
  lowercase: true,
  numbers: true,
  symbols: false,
  count: 5,
}

const CHARACTER_SET_FIELDS = [
  { key: 'uppercase', labelKey: 'uppercase' },
  { key: 'lowercase', labelKey: 'lowercase' },
  { key: 'numbers', labelKey: 'numbers' },
  { key: 'symbols', labelKey: 'symbols' },
] as const

export default function TokenGenerator() {
  const { t } = useTranslation('tools-crypto')
  const [options, setOptions] = useState<TokenOptions>(DEFAULT_OPTIONS)
  const [tokens, setTokens] = useState<string[]>(() => generateTokens(DEFAULT_OPTIONS))
  const [hasError, setHasError] = useState(false)

  const hasCharset = options.uppercase || options.lowercase || options.numbers || options.symbols

  const updateOption = <K extends keyof TokenOptions>(key: K, value: TokenOptions[K]) => {
    setOptions((previous) => ({ ...previous, [key]: value }))
  }

  const handleGenerate = () => {
    const count = Math.min(TOKEN_COUNT_RANGE.max, Math.max(TOKEN_COUNT_RANGE.min, options.count))
    try {
      setTokens(generateTokens({ ...options, count }))
      setHasError(false)
    } catch {
      setHasError(true)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor="token-length">{t('token-generator.length')}</Label>
          <div className="flex items-center gap-3">
            <Slider
              id="token-length"
              min={TOKEN_LENGTH_RANGE.min}
              max={TOKEN_LENGTH_RANGE.max}
              step={1}
              value={[options.length]}
              onValueChange={(values) => updateOption('length', values[0])}
              className="flex-1"
            />
            <Input
              type="number"
              min={TOKEN_LENGTH_RANGE.min}
              max={TOKEN_LENGTH_RANGE.max}
              value={options.length}
              onChange={(event) =>
                updateOption('length', Number(event.target.value) || TOKEN_LENGTH_RANGE.min)
              }
              className="w-20"
            />
          </div>
        </div>
        <div className="flex w-32 flex-col gap-2">
          <Label htmlFor="token-count">{t('common:generateCount')}</Label>
          <Input
            id="token-count"
            type="number"
            min={TOKEN_COUNT_RANGE.min}
            max={TOKEN_COUNT_RANGE.max}
            value={options.count}
            onChange={(event) =>
              updateOption('count', Number(event.target.value) || TOKEN_COUNT_RANGE.min)
            }
          />
        </div>
        <Button onClick={handleGenerate} className="gap-2">
          <RefreshCw className="size-4" />
          {t('common:generate')}
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        <Label>{t('token-generator.characterSets')}</Label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {CHARACTER_SET_FIELDS.map(({ key, labelKey }) => (
            <div key={key} className="flex items-center gap-2">
              <Switch
                id={`token-${key}`}
                checked={options[key]}
                onCheckedChange={(checked) => updateOption(key, checked)}
              />
              <Label htmlFor={`token-${key}`} className="font-normal">
                {t(`token-generator.${labelKey}`)}
              </Label>
            </div>
          ))}
        </div>
      </div>

      {!hasCharset && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertDescription>{t('token-generator.errorCharset')}</AlertDescription>
        </Alert>
      )}
      {hasError && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertDescription>{t('common:error')}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-2">
        {tokens.map((token, index) => (
          <InputCopyable
            key={`${index}-${token}`}
            value={token}
            readOnly
            className="font-mono"
            aria-label={`token-${index + 1}`}
          />
        ))}
      </div>
    </div>
  )
}
