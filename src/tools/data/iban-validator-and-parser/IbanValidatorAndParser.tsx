import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SpanCopyable } from '@/components/copyable/span-copyable'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table'
import { parseIban } from './iban-validator-and-parser.service'

export default function IbanValidatorAndParser() {
  const { t } = useTranslation('tools-data')

  const [input, setInput] = useState('')

  const result = useMemo(() => parseIban(input), [input])
  const hasInput = input.trim() !== ''

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="iban-input">{t('iban-validator-and-parser.ibanLabel')}</Label>
        <Input
          id="iban-input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={t('iban-validator-and-parser.ibanPlaceholder')}
          className="font-mono"
          spellCheck={false}
        />
      </div>

      {hasInput && (
        <>
          <div className="flex flex-col gap-2">
            <Label>{t('iban-validator-and-parser.validLabel')}</Label>
            <div>
              <Badge variant={result.valid ? 'default' : 'destructive'}>
                {result.valid
                  ? t('iban-validator-and-parser.valid')
                  : t('iban-validator-and-parser.invalid')}
              </Badge>
            </div>
          </div>

          <Table>
            <TableBody>
              <TableRow>
                <TableCell className="w-56 font-medium">
                  {t('iban-validator-and-parser.field-countryCode')}
                </TableCell>
                <TableCell>
                  {result.countryCode && <SpanCopyable value={result.countryCode} />}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="w-56 font-medium">
                  {t('iban-validator-and-parser.field-checkDigits')}
                </TableCell>
                <TableCell>
                  {result.checkDigits && <SpanCopyable value={result.checkDigits} />}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="w-56 font-medium">
                  {t('iban-validator-and-parser.field-bban')}
                </TableCell>
                <TableCell>{result.bban && <SpanCopyable value={result.bban} />}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="w-56 font-medium">
                  {t('iban-validator-and-parser.field-formatted')}
                </TableCell>
                <TableCell>
                  {result.formatted && <SpanCopyable value={result.formatted} />}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </>
      )}
    </div>
  )
}
