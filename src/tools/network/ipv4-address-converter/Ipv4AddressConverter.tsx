import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { InputCopyable } from '@/components/copyable/input-copyable'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Label } from '@/components/ui/label'
import { convertIpv4, type Ipv4Representations } from './ipv4-address-converter.service'

function representationRows(
  representations: Ipv4Representations,
): { key: string; value: string }[] {
  return [
    { key: 'field-decimal', value: representations.decimal },
    { key: 'field-hexadecimal', value: representations.hexadecimal },
    { key: 'field-binary', value: representations.binary },
    { key: 'field-octal', value: representations.octal },
    { key: 'field-dottedHexadecimal', value: representations.dottedHexadecimal },
  ]
}

export default function Ipv4AddressConverter() {
  const { t } = useTranslation('tools-network')
  const [input, setInput] = useState('')

  const result = useMemo<{ value: Ipv4Representations | null; error: string | null }>(() => {
    if (input.trim() === '') {
      return { value: null, error: null }
    }
    try {
      return { value: convertIpv4(input), error: null }
    } catch (err) {
      return { value: null, error: err instanceof Error ? err.message : String(err) }
    }
  }, [input])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label>{t('common:input')}</Label>
        <InputCopyable
          value={input}
          onValueChange={setInput}
          placeholder="192.168.1.10"
          className="font-mono text-sm"
        />
      </div>

      {result.error && (
        <Alert variant="destructive">
          <AlertDescription>{result.error}</AlertDescription>
        </Alert>
      )}

      {result.value && (
        <div className="flex flex-col gap-2">
          <Label>{t('common:output')}</Label>
          <div className="flex flex-col gap-2">
            {representationRows(result.value).map((row) => (
              <div key={row.key} className="flex items-center gap-3">
                <span className="text-muted-foreground w-32 shrink-0 text-sm">
                  {t(`ipv4-address-converter.${row.key}`)}
                </span>
                <InputCopyable value={row.value} readOnly className="font-mono text-sm" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
