import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  htmlEntitiesToText,
  textToHtmlEntities,
  textToUnicodeEscapes,
  unicodeEscapesToText,
} from '../encoder-decoder.service'
import { useConversion } from '../use-conversion'
import { EncodePair, Segmented, type Direction } from './pair-shell'

/** 表示形式：Unicode 转义串或 HTML 实体串 */
type UnicodeForm = 'escapes' | 'entities'

/** Unicode 转义 / HTML 实体 与文本互转：方向与形式各自一组切换 */
export function UnicodePanel() {
  const { t } = useTranslation('tools-development', { keyPrefix: 'encoder-decoder.unicode' })
  const { t: tShared } = useTranslation('tools-development', {
    keyPrefix: 'encoder-decoder.shared',
  })

  const [dir, setDir] = useState<Direction>('encode')
  const [form, setForm] = useState<UnicodeForm>('escapes')
  const [source, setSource] = useState('')

  const convert = useMemo(() => {
    if (dir === 'decode') {
      return form === 'escapes' ? unicodeEscapesToText : htmlEntitiesToText
    }
    return form === 'escapes' ? textToUnicodeEscapes : textToHtmlEntities
  }, [dir, form])
  const { value, error } = useConversion(source, convert)

  const encoding = dir === 'encode'
  const formName = form === 'escapes' ? t('escapesName') : t('entitiesName')

  return (
    <EncodePair
      direction={{ value: dir, onChange: setDir }}
      controls={
        <Segmented
          label={tShared('form')}
          value={form}
          onChange={setForm}
          options={[
            { value: 'escapes', label: t('escapesName') },
            { value: 'entities', label: t('entitiesName') },
          ]}
        />
      }
      input={{
        value: source,
        onValueChange: setSource,
        tag: encoding ? t('tagText') : formName,
        placeholder: encoding
          ? '中文 English'
          : form === 'entities'
            ? '&#20013;&#25991;'
            : '\\u4E2D\\u6587 \\u{1F680}',
      }}
      output={{
        value,
        tag: encoding ? formName : t('tagText'),
        placeholder: tShared('outputPlaceholder'),
      }}
      error={error}
    />
  )
}
