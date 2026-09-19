import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { InputCopyable } from '@/components/copyable/input-copyable'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { COLOR_FORMATS, parseColor, tryParseColor } from './service'
import type { ColorFormat, ColorValues } from './service'

const DEFAULT_COLOR = '#1ea54c'
const ROW_CLASS = 'grid grid-cols-[72px_1fr] items-center gap-3 sm:grid-cols-[100px_1fr]'

export default function ColorConverter() {
  const { t } = useTranslation('tools-development')

  const [values, setValues] = useState<ColorValues>(() => parseColor(DEFAULT_COLOR))
  const [invalidFormat, setInvalidFormat] = useState<ColorFormat | null>(null)

  // 取色器必须拿到合法 hex：按格式顺序取第一个仍可解析的行
  const anchor = useMemo<ColorValues>(() => {
    for (const format of COLOR_FORMATS) {
      const parsed = tryParseColor(values[format])
      if (parsed) {
        return parsed
      }
    }
    return parseColor(DEFAULT_COLOR)
  }, [values])

  const handleFormatChange = (format: ColorFormat, text: string) => {
    const parsed = tryParseColor(text)
    const next: ColorValues = { ...(parsed ?? values) }
    next[format] = text
    setValues(next)
    setInvalidFormat(parsed ? null : text.trim() === '' ? null : format)
  }

  return (
    <div className="flex flex-col gap-2">
      <div className={ROW_CLASS}>
        <Label htmlFor="color-converter-picker" className="text-muted-foreground justify-end">
          {t('color-converter.pickerLabel')}
        </Label>
        <Input
          id="color-converter-picker"
          type="color"
          value={anchor.hex}
          onChange={(event) => handleFormatChange('hex', event.target.value)}
          className="h-9 w-full cursor-pointer p-1"
          aria-label={t('color-converter.preview')}
        />
      </div>

      {invalidFormat && (
        <Alert variant="destructive">
          <AlertDescription>
            {t('color-converter.invalidFormat', {
              format: t(`color-converter.${invalidFormat}Label`),
            })}
          </AlertDescription>
        </Alert>
      )}

      {COLOR_FORMATS.map((format) => (
        <div key={format} className={ROW_CLASS}>
          <Label
            htmlFor={`color-converter-${format}`}
            className="text-muted-foreground justify-end"
          >
            {t(`color-converter.${format}Label`)}
          </Label>
          <InputCopyable
            id={`color-converter-${format}`}
            value={values[format]}
            onValueChange={(text) => handleFormatChange(format, text)}
            placeholder={t(`color-converter.${format}Placeholder`)}
            aria-invalid={invalidFormat === format}
            spellCheck={false}
            className="font-mono"
          />
        </div>
      ))}
    </div>
  )
}
