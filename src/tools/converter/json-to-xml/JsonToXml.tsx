import { useTranslation } from 'react-i18next'

import { FormatTransformer } from '@/components/format-transformer'
import { jsonToXml } from './json-to-xml.service'

export default function JsonToXml() {
  const { t } = useTranslation('tools-converter')
  const { t: tCommon } = useTranslation('common')

  return (
    <FormatTransformer
      transformer={jsonToXml}
      inputLabel={tCommon('input')}
      outputLabel={tCommon('output')}
      inputPlaceholder={t('json-to-xml.inputPlaceholder')}
      highlight
      language="xml"
    />
  )
}
