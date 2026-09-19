import { useTranslation } from 'react-i18next'

import { FormatTransformer } from '@/components/format-transformer'
import { tomlToYaml } from './toml-to-yaml.service'

export default function TomlToYaml() {
  const { t } = useTranslation('tools-converter')
  const { t: tCommon } = useTranslation('common')

  return (
    <FormatTransformer
      transformer={tomlToYaml}
      inputLabel={tCommon('input')}
      outputLabel={tCommon('output')}
      inputPlaceholder={t('toml-to-yaml.inputPlaceholder')}
      highlight
      language="yaml"
    />
  )
}
