import { useTranslation } from 'react-i18next'

import { FormatTransformer } from '@/components/format-transformer'
import { jsonToToml } from './json-to-toml.service'

export default function JsonToToml() {
  const { t } = useTranslation('tools-converter')
  const { t: tCommon } = useTranslation('common')

  return (
    <FormatTransformer
      transformer={jsonToToml}
      inputLabel={tCommon('input')}
      outputLabel={tCommon('output')}
      inputPlaceholder={t('json-to-toml.inputPlaceholder')}
      highlight
      language="toml"
    />
  )
}
