import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { InputCopyable } from '@/components/copyable/input-copyable'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toCaseAll } from './service'

const CASE_KEYS = [
  'camel',
  'pascal',
  'snake',
  'constant',
  'kebab',
  'train',
  'titleCase',
  'sentenceCase',
] as const

export default function CaseConverter() {
  const { t } = useTranslation('tools-text')

  const [input, setInput] = useState('')

  const results = useMemo(() => toCaseAll(input), [input])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label>{t('case-converter.inputLabel')}</Label>
        <Textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          className="min-h-24 font-mono text-sm"
          placeholder="hello world / foo_bar / kebab-case / fooBar"
        />
      </div>

      {CASE_KEYS.map((key) => (
        <div key={key} className="flex flex-col gap-1">
          <Label className="text-muted-foreground">{t(`case-converter.${key}`)}</Label>
          <InputCopyable value={results[key]} readOnly className="font-mono" />
        </div>
      ))}
    </div>
  )
}
