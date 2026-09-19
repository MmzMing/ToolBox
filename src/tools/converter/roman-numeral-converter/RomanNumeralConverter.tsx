import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { InputCopyable } from '@/components/copyable/input-copyable'
import { Label } from '@/components/ui/label'
import { fromRoman, toRoman } from './service'

export default function RomanNumeralConverter() {
  const { t } = useTranslation('tools-converter')
  const { t: tCommon } = useTranslation('common')

  const [numberInput, setNumberInput] = useState('')
  const [romanInput, setRomanInput] = useState('')
  const [numberError, setNumberError] = useState<string | null>(null)
  const [romanError, setRomanError] = useState<string | null>(null)

  const handleNumberChange = (value: string) => {
    setNumberInput(value)
    if (value.trim() === '') {
      setRomanInput('')
      setNumberError(null)
      return
    }
    try {
      setRomanInput(toRoman(Number(value)))
      setNumberError(null)
    } catch {
      setRomanInput('')
      setNumberError(tCommon('error'))
    }
  }

  const handleRomanChange = (value: string) => {
    setRomanInput(value)
    if (value.trim() === '') {
      setNumberInput('')
      setRomanError(null)
      return
    }
    try {
      setNumberInput(String(fromRoman(value)))
      setRomanError(null)
    } catch {
      setNumberInput('')
      setRomanError(tCommon('error'))
    }
  }

  const error = numberError ?? romanError

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-2">
        <Label>{t('roman-numeral-converter.numberLabel')}</Label>
        <InputCopyable
          value={numberInput}
          onValueChange={handleNumberChange}
          className="font-mono"
          placeholder="2026"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>{t('roman-numeral-converter.romanLabel')}</Label>
        <InputCopyable
          value={romanInput}
          onValueChange={handleRomanChange}
          className="font-mono"
          placeholder="MMXXVI"
        />
      </div>
    </div>
  )
}
