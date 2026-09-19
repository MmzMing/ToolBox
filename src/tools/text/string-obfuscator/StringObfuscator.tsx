import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { TextareaCopyable } from '@/components/copyable/textarea-copyable'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  obfuscateText,
  obfuscatorOptions,
  type ObfuscatorSelection,
} from './string-obfuscator.service'

const OPTION_LABEL_KEYS: Record<keyof ObfuscatorSelection, string> = {
  zeroWidth: 'string-obfuscator.opt-zeroWidth',
  htmlEntities: 'string-obfuscator.opt-htmlEntities',
  base64: 'string-obfuscator.opt-base64',
  reverse: 'string-obfuscator.opt-reverse',
}

const INITIAL_OPTIONS: ObfuscatorSelection = {
  zeroWidth: true,
  htmlEntities: false,
  base64: false,
  reverse: false,
}

export default function StringObfuscator() {
  const { t } = useTranslation('tools-text')

  const [text, setText] = useState('')
  const [options, setOptions] = useState<ObfuscatorSelection>(INITIAL_OPTIONS)

  const output = useMemo(() => obfuscateText(text, options), [text, options])

  const handleToggle = (option: keyof ObfuscatorSelection, checked: boolean) => {
    setOptions((previous) => ({ ...previous, [option]: checked }))
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="string-obfuscator-input">{t('common:input')}</Label>
        <Textarea
          id="string-obfuscator-input"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Hello Toolbox 👋"
          className="min-h-24"
        />
      </div>

      <div className="flex flex-col gap-3">
        <Label>{t('string-obfuscator.optionsLabel')}</Label>
        {obfuscatorOptions.map((option) => (
          <div key={option} className="flex items-center justify-between gap-4">
            <span className="text-sm">{t(OPTION_LABEL_KEYS[option])}</span>
            <Switch
              checked={options[option]}
              onCheckedChange={(checked) => handleToggle(option, checked)}
            />
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <Label>{t('common:output')}</Label>
        <TextareaCopyable value={output} rows={4} className="font-mono text-sm break-all" />
      </div>
    </div>
  )
}
