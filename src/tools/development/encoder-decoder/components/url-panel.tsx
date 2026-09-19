import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { TextareaCopyable } from '@/components/copyable/textarea-copyable'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import {
  decodeUrl,
  encodeUrl,
  urlEncodeModes,
  type UrlEncodeMode,
} from '../encoder-decoder.service'

/** URL 编解码：编码（整 URL / 组件模式）与解码两个子页签 */
export function UrlPanel() {
  const { t } = useTranslation('tools-development', { keyPrefix: 'encoder-decoder.url' })
  const { t: tCommon } = useTranslation('common')

  const [mode, setMode] = useState<UrlEncodeMode>('component')
  const [encodeInput, setEncodeInput] = useState('')
  const [decodeInput, setDecodeInput] = useState('')

  const encoded = useMemo(
    () => (encodeInput === '' ? '' : encodeUrl(encodeInput, mode)),
    [encodeInput, mode],
  )

  const decodeResult = useMemo(() => {
    if (decodeInput === '') {
      return { value: '', error: null as string | null }
    }
    try {
      return { value: decodeUrl(decodeInput), error: null as string | null }
    } catch (err) {
      return { value: '', error: err instanceof Error ? err.message : String(err) }
    }
  }, [decodeInput])

  return (
    <Tabs defaultValue="encode" className="gap-4">
      <TabsList>
        <TabsTrigger value="encode">{t('encodeTab')}</TabsTrigger>
        <TabsTrigger value="decode">{t('decodeTab')}</TabsTrigger>
      </TabsList>

      <TabsContent value="encode" className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label>{t('modeLabel')}</Label>
          <Select value={mode} onValueChange={(value) => setMode(value as UrlEncodeMode)}>
            <SelectTrigger className="w-72">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {urlEncodeModes.map((item) => (
                <SelectItem key={item} value={item}>
                  {t(`mode-${item}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label>{tCommon('input')}</Label>
          <Textarea
            value={encodeInput}
            onChange={(event) => setEncodeInput(event.target.value)}
            placeholder="https://example.com/?q=中文"
            className="min-h-24 font-mono text-sm"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label>{tCommon('output')}</Label>
          <TextareaCopyable value={encoded} rows={4} />
        </div>
      </TabsContent>

      <TabsContent value="decode" className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label>{tCommon('input')}</Label>
          <Textarea
            value={decodeInput}
            onChange={(event) => setDecodeInput(event.target.value)}
            placeholder="https%3A%2F%2Fexample.com%2F%3Fq%3D%E4%B8%AD%E6%96%87"
            className="min-h-24 font-mono text-sm"
          />
        </div>

        {decodeResult.error && (
          <Alert variant="destructive">
            <AlertDescription>{decodeResult.error}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col gap-2">
          <Label>{tCommon('output')}</Label>
          <TextareaCopyable value={decodeResult.value} rows={4} />
        </div>
      </TabsContent>
    </Tabs>
  )
}
