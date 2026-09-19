import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { TextareaCopyable } from '@/components/copyable/textarea-copyable'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { binaryToText, textToBinary, textToHex } from '../encoder-decoder.service'

/** 二进制 / 十六进制与文本互转（UTF-8） */
export function BinaryPanel() {
  const { t } = useTranslation('tools-development', { keyPrefix: 'encoder-decoder.binary' })
  const { t: tCommon } = useTranslation('common')

  const [text, setText] = useState('')
  const [binaryInput, setBinaryInput] = useState('')

  const forward = useMemo(() => ({ binary: textToBinary(text), hex: textToHex(text) }), [text])

  const reverse = useMemo(() => {
    if (binaryInput.trim() === '') {
      return { text: '', error: null }
    }
    try {
      return { text: binaryToText(binaryInput), error: null }
    } catch {
      return { text: '', error: tCommon('error') }
    }
  }, [binaryInput, tCommon])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label>{t('textToBinaryLabel')}</Label>
        <Textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          className="min-h-24 font-mono text-sm"
          placeholder="Hello 世界"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label className="text-muted-foreground">{t('binaryLabel')}</Label>
        <TextareaCopyable value={forward.binary} rows={3} />
      </div>

      <div className="flex flex-col gap-2">
        <Label className="text-muted-foreground">{t('hexLabel')}</Label>
        <TextareaCopyable value={forward.hex} rows={3} />
      </div>

      <div className="flex flex-col gap-2">
        <Label>{t('binaryToTextLabel')}</Label>
        <Textarea
          value={binaryInput}
          onChange={(event) => setBinaryInput(event.target.value)}
          className="min-h-24 font-mono text-sm"
          placeholder="01001000 01100101..."
        />
      </div>

      {reverse.error && (
        <Alert variant="destructive">
          <AlertDescription>{reverse.error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-2">
        <Label className="text-muted-foreground">{t('textOutput')}</Label>
        <TextareaCopyable value={reverse.text} rows={3} />
      </div>
    </div>
  )
}
