import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { TextareaCopyable } from '@/components/copyable/textarea-copyable'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  htmlEntitiesToText,
  textToHtmlEntities,
  textToUnicodeEscapes,
  unicodeEscapesToText,
} from './service'

export default function TextToUnicode() {
  const { t } = useTranslation('tools-converter')
  const { t: tCommon } = useTranslation('common')

  const [text, setText] = useState('')
  const [escapesInput, setEscapesInput] = useState('')
  const [entitiesInput, setEntitiesInput] = useState('')

  const forward = useMemo(
    () => ({
      escapes: textToUnicodeEscapes(text),
      entities: textToHtmlEntities(text),
    }),
    [text],
  )

  const fromEscapes = useMemo(() => {
    if (escapesInput.trim() === '') {
      return { text: '', error: null }
    }
    try {
      return { text: unicodeEscapesToText(escapesInput), error: null }
    } catch {
      return { text: '', error: tCommon('error') }
    }
  }, [escapesInput, tCommon])

  const fromEntities = useMemo(() => {
    if (entitiesInput.trim() === '') {
      return { text: '', error: null }
    }
    try {
      return { text: htmlEntitiesToText(entitiesInput), error: null }
    } catch {
      return { text: '', error: tCommon('error') }
    }
  }, [entitiesInput, tCommon])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label>{t('text-to-unicode.textToEscapesLabel')}</Label>
        <Textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          className="min-h-24 font-mono text-sm"
          placeholder="中文 English"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label className="text-muted-foreground">{t('text-to-unicode.escapesLabel')}</Label>
        <TextareaCopyable value={forward.escapes} rows={3} />
      </div>

      <div className="flex flex-col gap-2">
        <Label className="text-muted-foreground">{t('text-to-unicode.entitiesLabel')}</Label>
        <TextareaCopyable value={forward.entities} rows={3} />
      </div>

      <div className="flex flex-col gap-2">
        <Label>{t('text-to-unicode.escapesToTextLabel')}</Label>
        <Textarea
          value={escapesInput}
          onChange={(event) => setEscapesInput(event.target.value)}
          className="min-h-20 font-mono text-sm"
          placeholder="\u4E2D\u6587 \u{1F680}"
        />
      </div>

      {fromEscapes.error && (
        <Alert variant="destructive">
          <AlertDescription>{fromEscapes.error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-2">
        <Label className="text-muted-foreground">{t('text-to-unicode.textOutput')}</Label>
        <TextareaCopyable value={fromEscapes.text} rows={2} />
      </div>

      <div className="flex flex-col gap-2">
        <Label>{t('text-to-unicode.entitiesToTextLabel')}</Label>
        <Textarea
          value={entitiesInput}
          onChange={(event) => setEntitiesInput(event.target.value)}
          className="min-h-20 font-mono text-sm"
          placeholder="&#20013;&#25991;"
        />
      </div>

      {fromEntities.error && (
        <Alert variant="destructive">
          <AlertDescription>{fromEntities.error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-2">
        <Label className="text-muted-foreground">{t('text-to-unicode.textOutput')}</Label>
        <TextareaCopyable value={fromEntities.text} rows={2} />
      </div>
    </div>
  )
}
