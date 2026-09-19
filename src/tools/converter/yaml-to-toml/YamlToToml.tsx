import { useTranslation } from 'react-i18next'

import { FormatTransformer } from '@/components/format-transformer'
import { yamlToToml } from './yaml-to-toml.service'

export default function YamlToToml() {
  const { t } = useTranslation('tools-converter')
  const { t: tCommon } = useTranslation('common')

  return (
    <FormatTransformer
      transformer={yamlToToml}
      inputLabel={tCommon('input')}
      outputLabel={tCommon('output')}
      inputPlaceholder={t('yaml-to-toml.inputPlaceholder')}
      highlight
      language="toml"
    />
  )
}
