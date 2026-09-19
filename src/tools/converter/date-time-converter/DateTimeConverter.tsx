import { zhCN } from 'date-fns/locale'
import { Clock } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { InputCopyable } from '@/components/copyable/input-copyable'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatDateAll, parseDateInput } from './service'

export default function DateTimeConverter() {
  const { t, i18n } = useTranslation('tools-converter')
  const { t: tCommon } = useTranslation('common')

  const [input, setInput] = useState('')
  const relativeLocale = i18n.language.startsWith('zh') ? zhCN : undefined

  const parsed = useMemo(() => {
    if (input.trim() === '') {
      return { outputs: null, error: null }
    }
    try {
      const date = parseDateInput(input)
      return { outputs: formatDateAll(date, { relativeLocale }), error: null }
    } catch {
      return { outputs: null, error: tCommon('error') }
    }
  }, [input, relativeLocale, tCommon])

  const handleNow = () => {
    setInput(String(Date.now()))
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label>{t('date-time-converter.inputLabel')}</Label>
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            className="font-mono"
            placeholder="2026-09-19T12:34:56Z / 1789821296000"
          />
          <Button type="button" variant="outline" onClick={handleNow}>
            <Clock />
            {t('date-time-converter.now')}
          </Button>
        </div>
      </div>

      {parsed.error && (
        <Alert variant="destructive">
          <AlertDescription>{parsed.error}</AlertDescription>
        </Alert>
      )}

      {parsed.outputs && (
        <div className="flex flex-col gap-2">
          {parsed.outputs.map((output) => (
            <div key={output.label} className="flex flex-col gap-1">
              <Label className="text-muted-foreground">
                {t(`date-time-converter.labels.${output.label}`)}
              </Label>
              <InputCopyable value={output.value} readOnly className="font-mono" />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
