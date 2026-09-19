import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { InputCopyable } from '@/components/copyable/input-copyable'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { parseColor } from './service'

export default function ColorConverter() {
  const { t } = useTranslation('tools-converter')
  const { t: tCommon } = useTranslation('common')

  const [input, setInput] = useState('')

  const parsed = useMemo(() => {
    if (input.trim() === '') {
      return { color: null, error: null }
    }
    try {
      return { color: parseColor(input), error: null }
    } catch {
      return { color: null, error: tCommon('error') }
    }
  }, [input, tCommon])

  const rows = parsed.color
    ? [
        {
          key: 'hex',
          label: t('color-converter.hexLabel'),
          value: parsed.color.hex,
        },
        {
          key: 'rgb',
          label: t('color-converter.rgbLabel'),
          value: `rgb(${parsed.color.rgb.r}, ${parsed.color.rgb.g}, ${parsed.color.rgb.b})`,
        },
        {
          key: 'hsl',
          label: t('color-converter.hslLabel'),
          value: `hsl(${parsed.color.hsl.h}, ${parsed.color.hsl.s}%, ${parsed.color.hsl.l}%)`,
        },
      ]
    : []

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Label>{t('color-converter.colorInput')}</Label>
          <Input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            className="font-mono"
            placeholder="#1ea54c / rgb(30, 165, 76) / hsl(148, 69%, 38%)"
          />
        </div>
        <div
          className="size-10 shrink-0 rounded-md border"
          style={{ backgroundColor: parsed.color?.hex ?? 'transparent' }}
          title={parsed.color?.hex}
          aria-label={t('color-converter.preview')}
        />
      </div>

      {parsed.error && (
        <Alert variant="destructive">
          <AlertDescription>{parsed.error}</AlertDescription>
        </Alert>
      )}

      {rows.map((row) => (
        <div key={row.key} className="flex flex-col gap-1">
          <Label className="text-muted-foreground">{row.label}</Label>
          <InputCopyable value={row.value} readOnly className="font-mono" />
        </div>
      ))}
    </div>
  )
}
