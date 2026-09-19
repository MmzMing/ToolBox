import { useTranslation } from 'react-i18next'

import { FormatTransformer } from '@/components/format-transformer'
import { jsonToYaml } from './json-to-yaml-converter.service'

export default function JsonToYamlConverter() {
  const { t } = useTranslation('tools-converter')
  const { t: tCommon } = useTranslation('common')

  return (
    <FormatTransformer
      transformer={jsonToYaml}
      inputLabel={tCommon('input')}
      outputLabel={tCommon('output')}
      inputPlaceholder={t('json-to-yaml-converter.inputPlaceholder')}
      highlight
      language="yaml"
    />
  )
}
