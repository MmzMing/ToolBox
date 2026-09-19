import { Binary } from 'lucide-react'
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
import { Switch } from '@/components/ui/switch'
import { convertBase } from './service'

const BASE_OPTIONS = Array.from({ length: 35 }, (_, index) => index + 2)
const BATCH_BASES = [2, 8, 10, 16] as const
const BATCH_LABELS: Record<(typeof BATCH_BASES)[number], string> = {
  2: 'base2',
  8: 'base8',
  10: 'base10',
  16: 'base16',
}

export default function IntegerBaseConverter() {
  const { t } = useTranslation('tools-converter')
  const { t: tCommon } = useTranslation('common')

  const [value, setValue] = useState('')
  const [fromBase, setFromBase] = useState(10)
  const [toBase, setToBase] = useState(16)
  const [showBatch, setShowBatch] = useState(false)

  const converted = useMemo(() => {
    if (value.trim() === '') {
      return { output: '', error: null }
    }
    try {
      return { output: convertBase(value, fromBase, toBase), error: null }
    } catch {
      return { output: '', error: tCommon('error') }
    }
  }, [value, fromBase, toBase, tCommon])

  const batchResults = useMemo(() => {
    if (!showBatch || value.trim() === '') {
      return []
    }
    return BATCH_BASES.map((base) => {
      try {
        return { base, label: BATCH_LABELS[base], output: convertBase(value, fromBase, base) }
      } catch {
        return { base, label: BATCH_LABELS[base], output: '' }
      }
    })
  }, [showBatch, value, fromBase])

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-2">
          <Label>{t('integer-base-converter.fromBase')}</Label>
          <BaseSelect value={fromBase} onValueChange={setFromBase} />
        </div>
        <div className="flex flex-col gap-2">
          <Label>{t('integer-base-converter.toBase')}</Label>
          <BaseSelect value={toBase} onValueChange={setToBase} />
        </div>
        <div className="flex items-end gap-2 pb-1">
          <Switch id="integer-base-batch" checked={showBatch} onCheckedChange={setShowBatch} />
          <Label htmlFor="integer-base-batch" className="cursor-pointer">
            {t('integer-base-converter.batch')}
          </Label>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>{t('integer-base-converter.valueLabel')}</Label>
        <Input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="font-mono"
          placeholder="1234567890"
        />
      </div>

      {converted.error && (
        <Alert variant="destructive">
          <AlertDescription>{converted.error}</AlertDescription>
        </Alert>
      )}

      {!converted.error && (
        <div className="flex flex-col gap-2">
          <Label className="text-muted-foreground flex items-center gap-1.5">
            <Binary className="size-4" />
            {t('integer-base-converter.outputBase', { base: toBase })}
          </Label>
          <InputCopyable value={converted.output} readOnly className="font-mono" />
        </div>
      )}

      {batchResults.length > 0 && (
        <div className="flex flex-col gap-2">
          {batchResults.map((item) => (
            <div key={item.base} className="flex flex-col gap-1">
              <Label className="text-muted-foreground">
                {t(`integer-base-converter.${item.label}`)}
              </Label>
              <InputCopyable value={item.output} readOnly className="font-mono" />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

interface BaseSelectProps {
  value: number
  onValueChange: (value: number) => void
}

function BaseSelect({ value, onValueChange }: BaseSelectProps) {
  const { t } = useTranslation('tools-converter')
  return (
    <Select
      value={String(value)}
      onValueChange={(next) => onValueChange(Number.parseInt(next, 10))}
    >
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {BASE_OPTIONS.map((base) => (
          <SelectItem key={base} value={String(base)}>
            {t('integer-base-converter.optionBase', { base })}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
