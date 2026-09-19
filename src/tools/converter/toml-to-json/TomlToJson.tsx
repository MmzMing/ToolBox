import { useTranslation } from 'react-i18next'

import { FormatTransformer } from '@/components/format-transformer'
import { tomlToJson } from './toml-to-json.service'

export default function TomlToJson() {
  const { t } = useTranslation('tools-converter')
  const { t: tCommon } = useTranslation('common')

  return (
    <FormatTransformer
      transformer={tomlToJson}
      inputLabel={tCommon('input')}
      outputLabel={tCommon('output')}
      inputPlaceholder={t('toml-to-json.inputPlaceholder')}
      highlight
      language="json"
    />
  )
}
