import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  decodeUrl,
  encodeUrl,
  urlEncodeModes,
  type UrlEncodeMode,
} from '../encoder-decoder.service'
import { useConversion } from '../use-conversion'
import { EncodePair, type Direction } from './pair-shell'

/** URL 编解码：方向切换替代原来的「编码 / 解码」子页签 */
export function UrlPanel() {
  const { t } = useTranslation('tools-development', { keyPrefix: 'encoder-decoder.url' })
  const { t: tShared } = useTranslation('tools-development', {
    keyPrefix: 'encoder-decoder.shared',
  })

  const [dir, setDir] = useState<Direction>('encode')
  const [mode, setMode] = useState<UrlEncodeMode>('component')
  const [source, setSource] = useState('')

  // 解码没有「模式」可言：decodeURIComponent 一次还原全部百分号编码
  const convert = useMemo(
    () => (dir === 'encode' ? (text: string) => encodeUrl(text, mode) : decodeUrl),
    [dir, mode],
  )
  const { value, error } = useConversion(source, convert)

  const encoding = dir === 'encode'

  return (
    <EncodePair
      direction={{ value: dir, onChange: setDir }}
      controls={
        encoding ? (
          <div className="flex items-center gap-2">
            <Label
              htmlFor="encoder-decoder-url-mode"
              className="text-muted-foreground shrink-0 text-xs"
            >
              {t('modeLabel')}
            </Label>
            <Select value={mode} onValueChange={(next) => setMode(next as UrlEncodeMode)}>
              <SelectTrigger id="encoder-decoder-url-mode" size="sm" className="min-w-56">
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
        ) : undefined
      }
      input={{
        value: source,
        onValueChange: setSource,
        tag: encoding ? t('tagText') : t('tagEncoded'),
        placeholder: encoding
          ? 'https://example.com/?q=中文'
          : 'https%3A%2F%2Fexample.com%2F%3Fq%3D%E4%B8%AD%E6%96%87',
      }}
      output={{
        value,
        tag: encoding ? t('tagEncoded') : t('tagText'),
        placeholder: tShared('outputPlaceholder'),
      }}
      error={error}
    />
  )
}
