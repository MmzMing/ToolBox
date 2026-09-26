import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { decodeFromBase64, encodeToBase64 } from '../encoder-decoder.service'
import { useConversion } from '../use-conversion'
import { EncodePair, type Direction } from './pair-shell'

/** Base64：单输入单输出，方向切换决定哪一侧是原文 */
export function Base64Panel() {
  const { t } = useTranslation('tools-development', { keyPrefix: 'encoder-decoder.base64' })
  const { t: tShared } = useTranslation('tools-development', {
    keyPrefix: 'encoder-decoder.shared',
  })

  const [dir, setDir] = useState<Direction>('encode')
  const [source, setSource] = useState('')

  const convert = useMemo(() => (dir === 'encode' ? encodeToBase64 : decodeFromBase64), [dir])
  const { value, error } = useConversion(source, convert)

  const encoding = dir === 'encode'

  return (
    <EncodePair
      direction={{ value: dir, onChange: setDir }}
      input={{
        value: source,
        onValueChange: setSource,
        tag: encoding ? t('plainLabel') : t('base64Label'),
        placeholder: encoding ? 'Hello 世界 🚀' : 'SGVsbG8g5LiW55WM',
      }}
      output={{
        value,
        tag: encoding ? t('base64Label') : t('plainLabel'),
        placeholder: tShared('outputPlaceholder'),
      }}
      error={error}
    />
  )
}
