import { useTranslation } from 'react-i18next'

import { FormatTransformer } from '@/components/format-transformer'
import { xmlToJson } from './xml-to-json.service'

export default function XmlToJson() {
  const { t } = useTranslation('tools-converter')
  const { t: tCommon } = useTranslation('common')

  return (
    <FormatTransformer
      transformer={xmlToJson}
      inputLabel={tCommon('input')}
      outputLabel={tCommon('output')}
      inputPlaceholder={t('xml-to-json.inputPlaceholder')}
      highlight
      language="json"
    />
  )
}
