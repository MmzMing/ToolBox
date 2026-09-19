import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SpanCopyable } from '@/components/copyable/span-copyable'
import { TextareaCopyable } from '@/components/copyable/textarea-copyable'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toNatoAlphabet, toNatoText } from './service'

export default function TextToNatoAlphabet() {
  const { t } = useTranslation('tools-converter')

  const [input, setInput] = useState('')

  const entries = useMemo(() => toNatoAlphabet(input), [input])
  const transcription = useMemo(() => toNatoText(input), [input])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label>{t('text-to-nato-alphabet.inputLabel')}</Label>
        <Textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          className="min-h-24 font-mono text-sm"
          placeholder="SOS"
        />
      </div>

      {entries.length > 0 && (
        <div className="flex flex-col gap-2">
          <Label className="text-muted-foreground">{t('text-to-nato-alphabet.charMapLabel')}</Label>
          <div className="flex flex-wrap gap-2">
            {entries.map((entry, index) => (
              <SpanCopyable
                key={`${entry.char}-${index}`}
                value={entry.word}
                className={entry.word === '[space]' ? 'opacity-60' : undefined}
              />
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label className="text-muted-foreground">
          {t('text-to-nato-alphabet.transcriptionLabel')}
        </Label>
        <TextareaCopyable value={transcription} rows={2} />
      </div>
    </div>
  )
}
