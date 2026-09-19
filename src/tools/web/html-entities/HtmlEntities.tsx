import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { decodeHtmlEntities, encodeHtmlEntities } from './html-entities.service'

export default function HtmlEntities() {
  const { t } = useTranslation('tools-web')
  const { t: tCommon } = useTranslation('common')

  const [text, setText] = useState('')
  const [entities, setEntities] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleTextChange = (value: string) => {
    setText(value)
    setEntities(encodeHtmlEntities(value))
    setError(null)
  }

  const handleEntitiesChange = (value: string) => {
    setEntities(value)
    try {
      setText(decodeHtmlEntities(value))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : tCommon('error'))
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label>{t('html-entities.textLabel')}</Label>
        <Textarea
          value={text}
          onChange={(event) => handleTextChange(event.target.value)}
          placeholder={`<a href="/home">首页 © 2026</a>`}
          className="min-h-32 font-mono text-sm"
        />
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-2">
        <Label>{t('html-entities.entitiesLabel')}</Label>
        <Textarea
          value={entities}
          onChange={(event) => handleEntitiesChange(event.target.value)}
          placeholder={'&lt;a href=&quot;/home&quot;&gt;&#39318;&#39029; &amp;copy; 2026&lt;/a&gt;'}
          className="min-h-32 font-mono text-sm"
        />
      </div>
    </div>
  )
}
