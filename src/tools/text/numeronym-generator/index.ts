import { TextCursorInput } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'numeronym-generator',
  path: '/numeronym-generator',
  keywords: ['numeronym', 'abbreviation', 'i18n', 'l10n', 'a11y', '首字母缩写', '缩写'],
  icon: TextCursorInput,
  component: () => import('./NumeronymGenerator'),
  createdAt: '2026-09-19',
})
