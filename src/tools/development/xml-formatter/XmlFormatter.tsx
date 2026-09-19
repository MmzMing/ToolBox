import { useTranslation } from 'react-i18next'

import { FormatTransformer } from '@/components/format-transformer'
import { formatXml } from './xml-formatter.service'

export default function XmlFormatter() {
  const { t } = useTranslation('common')

  return (
    <FormatTransformer
      transformer={formatXml}
      inputLabel={t('input')}
      outputLabel={t('output')}
      highlight
      language="xml"
      rows={10}
    />
  )
}
