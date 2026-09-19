import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { TextareaCopyable } from '@/components/copyable/textarea-copyable'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { hashAlgorithms, hashText, type HashAlgorithm } from './service'

export default function HashText() {
  const { t } = useTranslation('common')
  const [algorithm, setAlgorithm] = useState<HashAlgorithm>('SHA256')
  const [input, setInput] = useState('')

  const output = useMemo(() => (input === '' ? '' : hashText(algorithm, input)), [algorithm, input])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label>Hash</Label>
        <Select value={algorithm} onValueChange={(value) => setAlgorithm(value as HashAlgorithm)}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {hashAlgorithms.map((item) => (
              <SelectItem key={item} value={item}>
                {item}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <Label>{t('input')}</Label>
        <Textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="https://example.com"
          className="min-h-24 font-mono text-sm"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>{t('output')}</Label>
        <TextareaCopyable value={output} rows={4} />
      </div>
    </div>
  )
}
