import { useTranslation } from 'react-i18next'

import { FormatTransformer } from '@/components/format-transformer'
import { formatSql } from './sql-prettify.service'

export default function SqlPrettify() {
  const { t } = useTranslation('common')

  return (
    <FormatTransformer
      transformer={formatSql}
      inputLabel={t('input')}
      outputLabel={t('output')}
      rows={10}
    />
  )
}
