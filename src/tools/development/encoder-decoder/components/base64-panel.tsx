import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { decodeFromBase64, encodeToBase64 } from '../encoder-decoder.service'

/** Base64 双向转换：编辑任一侧即时联动另一侧 */
export function Base64Panel() {
  const { t } = useTranslation('tools-development', { keyPrefix: 'encoder-decoder.base64' })
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
      setBase64('')
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleBase64Change = (value: string) => {
    setBase64(value)
    try {
      setPlain(decodeFromBase64(value))
      setError(null)
    } catch {
      setPlain('')
      setError(tCommon('error'))
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label>{t('plainLabel')}</Label>
        <Textarea
          value={plain}
          onChange={(event) => handlePlainChange(event.target.value)}
          className="min-h-32 font-mono text-sm"
          placeholder="Hello 世界 🚀"
        />
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-2">
        <Label>{t('base64Label')}</Label>
        <Textarea
          value={base64}
          onChange={(event) => handleBase64Change(event.target.value)}
          className="min-h-32 font-mono text-sm"
          placeholder="aGVsbG8gd29ybGQ="
        />
      </div>
    </div>
  )
}
