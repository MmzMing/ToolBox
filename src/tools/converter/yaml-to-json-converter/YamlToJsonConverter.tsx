import { useTranslation } from 'react-i18next'

import { FormatTransformer } from '@/components/format-transformer'
import { yamlToJson } from './yaml-to-json-converter.service'

export default function YamlToJsonConverter() {
  const { t } = useTranslation('tools-converter')
  const { t: tCommon } = useTranslation('common')

  return (
    <FormatTransformer
      transformer={yamlToJson}
      inputLabel={tCommon('input')}
      outputLabel={tCommon('output')}
      inputPlaceholder={t('yaml-to-json-converter.inputPlaceholder')}
      highlight
      language="json"
    />
  )
}
