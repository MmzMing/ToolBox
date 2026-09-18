import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { decodeFromBase64, encodeToBase64 } from './service'

export default function Base64StringConverter() {
  const { t } = useTranslation('tools-converter')
  const { t: tCommon } = useTranslation('common')

  const [plain, setPlain] = useState('')
  const [base64, setBase64] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handlePlainChange = (value: string) => {
    setPlain(value)
    try {
      setBase64(encodeToBase64(value))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleBase64Change = (value: string) => {
    setBase64(value)
    try {
      setPlain(decodeFromBase64(value))
      setError(null)
    } catch {
      setError(tCommon('error'))
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label>{t('base64-string-converter.plainLabel')}</Label>
        <Textarea
          value={plain}
          onChange={(event) => handlePlainChange(event.target.value)}
          className="min-h-32 font-mono text-sm"
          placeholder="https://example.com/?q=中文"
        />
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-2">
        <Label>{t('base64-string-converter.base64Label')}</Label>
        <Textarea
          value={base64}
          onChange={(event) => handleBase64Change(event.target.value)}
          className="min-h-32 font-mono text-sm"
          placeholder="aHR0cHM6Ly9leGFtcGxlLmNvbS8..."
        />
      </div>
    </div>
  )
}
