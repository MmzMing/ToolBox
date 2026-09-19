import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { TextareaCopyable } from '@/components/copyable/textarea-copyable'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { transformList, type ListTransformOptions } from './service'

const TOGGLE_KEYS = [
  'dedupe',
  'sort',
  'reverse',
  'lowercase',
  'uppercase',
  'removeEmpty',
  'trim',
] as const

type ToggleKey = (typeof TOGGLE_KEYS)[number]

const INITIAL_OPTIONS: ListTransformOptions = {
  separator: ',',
  dedupe: false,
  sort: false,
  reverse: false,
  lowercase: false,
  uppercase: false,
  removeEmpty: false,
  trim: false,
}

export default function ListConverter() {
  const { t } = useTranslation('tools-converter')

  const [input, setInput] = useState('')
  const [options, setOptions] = useState<ListTransformOptions>(INITIAL_OPTIONS)

  const handleOptionChange = (key: ToggleKey, checked: boolean) => {
    setOptions((previous) => ({ ...previous, [key]: checked }))
  }

  const handleSeparatorChange = (value: string) => {
    setOptions((previous) => ({ ...previous, separator: value }))
  }

  const result = useMemo(() => transformList(input, options), [input, options])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label>{t('list-converter.inputLabel')}</Label>
        <Textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          className="min-h-32 font-mono text-sm"
          placeholder={'banana\napple\ncherry'}
        />
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
        {TOGGLE_KEYS.map((key) => (
          <Label
            key={key}
            htmlFor={`list-converter-${key}`}
            className="flex cursor-pointer items-center gap-2"
          >
            <Switch
              id={`list-converter-${key}`}
              checked={options[key]}
              onCheckedChange={(checked) => handleOptionChange(key, checked)}
            />
            <span className="text-sm font-normal">{t(`list-converter.${key}`)}</span>
          </Label>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <Label>{t('list-converter.separatorLabel')}</Label>
        <Input
          value={options.separator}
          onChange={(event) => handleSeparatorChange(event.target.value)}
          className="max-w-48 font-mono"
          placeholder=","
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label className="text-muted-foreground">{t('list-converter.linesOutput')}</Label>
        <TextareaCopyable value={result.lines.join('\n')} rows={5} />
      </div>

      <div className="flex flex-col gap-2">
        <Label className="text-muted-foreground">{t('list-converter.joinedOutput')}</Label>
        <TextareaCopyable value={result.joined} rows={2} />
      </div>
    </div>
  )
}
