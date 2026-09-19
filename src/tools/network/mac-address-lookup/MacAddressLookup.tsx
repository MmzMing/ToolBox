import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { InputCopyable } from '@/components/copyable/input-copyable'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Label } from '@/components/ui/label'
import { lookupMacVendor, macOuiPrefix, normalizeMac } from './mac-address-lookup.service'

export default function MacAddressLookup() {
  const { t } = useTranslation('tools-network')
  const [input, setInput] = useState('')

  const result = useMemo<{
    normalized: string
    oui: string
    vendor: string | null
    error: string | null
  } | null>(() => {
    if (input.trim() === '') {
      return null
    }
    try {
      const normalized = normalizeMac(input)
      return {
        normalized,
        oui: macOuiPrefix(input),
        vendor: lookupMacVendor(input),
        error: null,
      }
    } catch (err) {
      return {
        normalized: '',
        oui: '',
        vendor: null,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }, [input])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label>{t('common:input')}</Label>
        <InputCopyable
          value={input}
          onValueChange={setInput}
          placeholder="00:1A:2B:3C:4D:5E"
          className="font-mono text-sm"
        />
      </div>

      {result?.error && (
        <Alert variant="destructive">
          <AlertDescription>{result.error}</AlertDescription>
        </Alert>
      )}

      {result && !result.error && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground w-32 shrink-0 text-sm">
              {t('mac-address-lookup.normalizedLabel')}
            </span>
            <InputCopyable value={result.normalized} readOnly className="font-mono text-sm" />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground w-32 shrink-0 text-sm">
              {t('mac-address-lookup.ouiLabel')}
            </span>
            <InputCopyable value={result.oui} readOnly className="font-mono text-sm" />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground w-32 shrink-0 text-sm">
              {t('mac-address-lookup.vendorLabel')}
            </span>
            {result.vendor ? (
              <InputCopyable value={result.vendor} readOnly className="font-mono text-sm" />
            ) : (
              <span className="text-muted-foreground text-sm">
                {t('mac-address-lookup.unknownVendor')}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
