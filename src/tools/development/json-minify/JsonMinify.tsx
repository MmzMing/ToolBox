import { useTranslation } from 'react-i18next'

import { FormatTransformer } from '@/components/format-transformer'
import { minify } from './json-minify.service'

export default function JsonMinify() {
  const { t } = useTranslation('common')

  return (
    <FormatTransformer transformer={minify} inputLabel={t('input')} outputLabel={t('output')} />
  )
}
