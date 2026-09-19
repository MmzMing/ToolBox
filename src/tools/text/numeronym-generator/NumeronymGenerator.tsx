import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SpanCopyable } from '@/components/copyable/span-copyable'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { toNumeronyms } from './numeronym-generator.service'

export default function NumeronymGenerator() {
  const { t } = useTranslation('tools-text')

  const [input, setInput] = useState('')

  const entries = useMemo(() => toNumeronyms(input), [input])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="numeronym-input">{t('numeronym-generator.inputLabel')}</Label>
        <Textarea
          id="numeronym-input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={t('numeronym-generator.inputPlaceholder')}
          className="min-h-24"
        />
      </div>

      {entries.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-1/2">{t('numeronym-generator.wordColumn')}</TableHead>
              <TableHead>{t('numeronym-generator.numeronymColumn')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => (
              <TableRow key={entry.word}>
                <TableCell className="font-medium">{entry.word}</TableCell>
                <TableCell>
                  <SpanCopyable value={entry.numeronym} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
