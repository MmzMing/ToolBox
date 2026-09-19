import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SpanCopyable } from '@/components/copyable/span-copyable'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { normalizeEmailList, type EmailNormalizeOptions } from './email-normalizer.service'

const OPTION_KEYS = ['gmailDots', 'plusTag', 'lowercase', 'dedupe'] as const

type OptionKey = (typeof OPTION_KEYS)[number]

const INITIAL_OPTIONS: EmailNormalizeOptions & { dedupe: boolean } = {
  gmailDots: true,
  plusTag: true,
  lowercase: true,
  dedupe: true,
}

export default function EmailNormalizer() {
  const { t } = useTranslation('tools-development')
  const { t: tCommon } = useTranslation('common')
  const [input, setInput] = useState('')
  const [options, setOptions] = useState(INITIAL_OPTIONS)

  const { result, error } = useMemo(() => {
    const { dedupe, ...normalizeOptions } = options
    try {
      return {
        result: normalizeEmailList(input, normalizeOptions, dedupe),
        error: null as string | null,
      }
    } catch (err) {
      return { result: [], error: err instanceof Error ? err.message : String(err) }
    }
  }, [input, options])

  const handleOptionChange = (key: OptionKey, checked: boolean) => {
    setOptions((previous) => ({ ...previous, [key]: checked }))
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label>{tCommon('input')}</Label>
        <Textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={t('email-normalizer.inputPlaceholder')}
          className="min-h-32 font-mono text-sm"
        />
      </div>

      <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
        {OPTION_KEYS.map((key) => (
          <Label
            key={key}
            htmlFor={`email-normalizer-${key}`}
            className="flex cursor-pointer items-center gap-2"
          >
            <Switch
              id={`email-normalizer-${key}`}
              checked={options[key]}
              onCheckedChange={(checked) => handleOptionChange(key, checked)}
            />
            <span className="text-sm font-normal">{t(`email-normalizer.${key}`)}</span>
          </Label>
        ))}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-2">
        <Label className="text-muted-foreground">{t('email-normalizer.resultLabel')}</Label>
        {result.length === 0 ? (
          <p className="text-muted-foreground text-sm">-</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {result.map((email) => (
              <SpanCopyable key={email} value={email} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
