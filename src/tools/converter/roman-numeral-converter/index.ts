import { Columns3 } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'roman-numeral-converter',
  path: '/roman-numeral-converter',
  keywords: ['roman', 'numeral', 'number', 'rome', '罗马数字', '数字'],
  icon: Columns3,
  component: () => import('./RomanNumeralConverter'),
  createdAt: '2026-09-19',
})
