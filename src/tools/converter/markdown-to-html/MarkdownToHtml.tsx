import { useTranslation } from 'react-i18next'

import { FormatTransformer } from '@/components/format-transformer'
import { markdownToHtml } from './markdown-to-html.service'

export default function MarkdownToHtml() {
  const { t } = useTranslation('tools-converter')
  const { t: tCommon } = useTranslation('common')

  return (
    <FormatTransformer
      transformer={markdownToHtml}
      inputLabel={tCommon('input')}
      outputLabel={tCommon('output')}
      inputPlaceholder={t('markdown-to-html.inputPlaceholder')}
      highlight
      language="xml"
    />
  )
}
