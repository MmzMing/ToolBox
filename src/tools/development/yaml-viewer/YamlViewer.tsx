import { useTranslation } from 'react-i18next'

import { FormatTransformer } from '@/components/format-transformer'
import { formatYaml } from './yaml-viewer.service'

export default function YamlViewer() {
  const { t } = useTranslation('common')

  return (
    <FormatTransformer
      transformer={formatYaml}
      inputLabel={t('input')}
      outputLabel={t('output')}
      highlight
      language="yaml"
      rows={10}
    />
  )
}
