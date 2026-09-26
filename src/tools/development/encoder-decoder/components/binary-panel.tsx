import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { binaryToText, hexToText, textToBinary, textToHex } from '../encoder-decoder.service'
import { useConversion } from '../use-conversion'
import { EncodePair, Segmented, type Direction } from './pair-shell'

/** 表示形式：按 UTF-8 字节展开的二进制串或十六进制串 */
type BinaryForm = 'binary' | 'hex'

/** 二进制 / 十六进制与文本互转（UTF-8） */
export function BinaryPanel() {
  const { t } = useTranslation('tools-development', { keyPrefix: 'encoder-decoder.binary' })
  const { t: tShared } = useTranslation('tools-development', {
    keyPrefix: 'encoder-decoder.shared',
  })

  const [dir, setDir] = useState<Direction>('encode')
  const [form, setForm] = useState<BinaryForm>('binary')
  const [source, setSource] = useState('')

  const convert = useMemo(() => {
    if (dir === 'decode') {
      return form === 'binary' ? binaryToText : hexToText
    }
    return form === 'binary' ? textToBinary : textToHex
  }, [dir, form])
  const { value, error } = useConversion(source, convert)

  const encoding = dir === 'encode'
  const formName = form === 'binary' ? t('binaryLabel') : t('hexLabel')

  return (
    <EncodePair
      direction={{ value: dir, onChange: setDir }}
      controls={
        <Segmented
          label={tShared('form')}
          value={form}
          onChange={setForm}
          options={[
            { value: 'binary', label: t('binaryLabel') },
            { value: 'hex', label: t('hexLabel') },
          ]}
        />
      }
      input={{
        value: source,
        onValueChange: setSource,
        tag: encoding ? t('tagText') : formName,
        placeholder: encoding
          ? 'Hello 世界'
          : form === 'binary'
            ? '01001000 01100101'
            : '48 65 6c 6c 6f',
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
