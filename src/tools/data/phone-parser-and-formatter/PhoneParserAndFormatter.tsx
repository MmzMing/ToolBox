import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SpanCopyable } from '@/components/copyable/span-copyable'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table'
import { parsePhone, phoneCountries, type PhoneCountry } from './phone-parser-and-formatter.service'

const ERROR_FALLBACK_KEY = 'phone-parser-and-formatter.error-unknown'

interface ResultRowProps {
  label: string
  value: string | null
}

function ResultRow({ label, value }: ResultRowProps) {
  return (
    <TableRow>
      <TableCell className="w-56 font-medium">{label}</TableCell>
      <TableCell>{value !== null && <SpanCopyable value={value} />}</TableCell>
    </TableRow>
  )
}

export default function PhoneParserAndFormatter() {
  const { t } = useTranslation('tools-data')

  const [raw, setRaw] = useState('')
  const [country, setCountry] = useState<PhoneCountry>('CN')

  const parsed = useMemo(() => parsePhone(raw, country), [raw, country])
  const hasInput = raw.trim() !== ''

  const errorText = parsed.error
    ? t(`phone-parser-and-formatter.error-${parsed.error}`, {
        defaultValue: t(ERROR_FALLBACK_KEY),
      })
    : null

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor="phone-number-input">{t('phone-parser-and-formatter.numberLabel')}</Label>
          <Input
            id="phone-number-input"
            value={raw}
            onChange={(event) => setRaw(event.target.value)}
            placeholder={t('phone-parser-and-formatter.numberPlaceholder')}
            className="font-mono"
          />
        </div>

        <div className="flex flex-col gap-2 sm:w-56">
          <Label>{t('phone-parser-and-formatter.countryLabel')}</Label>
          <Select value={country} onValueChange={(value) => setCountry(value as PhoneCountry)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {phoneCountries.map((item) => (
                <SelectItem key={item} value={item}>
                  {t(`phone-parser-and-formatter.country-${item}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {hasInput && (
        <>
          <div className="flex flex-col gap-2">
            <Label>{t('phone-parser-and-formatter.validLabel')}</Label>
            <div>
              <Badge variant={parsed.valid ? 'default' : 'destructive'}>
                {parsed.valid
                  ? t('phone-parser-and-formatter.valid')
                  : t('phone-parser-and-formatter.invalid')}
              </Badge>
            </div>
          </div>

          {errorText && (
            <Alert variant="destructive">
              <AlertDescription>{errorText}</AlertDescription>
            </Alert>
          )}

          {parsed.e164 !== null && (
            <Table>
              <TableBody>
                <ResultRow label={t('phone-parser-and-formatter.field-e164')} value={parsed.e164} />
                <ResultRow
                  label={t('phone-parser-and-formatter.field-international')}
                  value={parsed.international}
                />
                <ResultRow
                  label={t('phone-parser-and-formatter.field-national')}
                  value={parsed.national}
                />
                <ResultRow
                  label={t('phone-parser-and-formatter.field-countryCode')}
                  value={parsed.countryCode === null ? null : `+${parsed.countryCode}`}
                />
                <TableRow>
                  <TableCell className="w-56 font-medium">
                    {t('phone-parser-and-formatter.field-type')}
                  </TableCell>
                  <TableCell>
                    {parsed.type
                      ? t(`phone-parser-and-formatter.type-${parsed.type}`, {
                          defaultValue: parsed.type,
                        })
                      : t('phone-parser-and-formatter.typeUnknown')}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </>
      )}
    </div>
  )
}
