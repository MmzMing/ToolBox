import { Binary } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'integer-base-converter',
  path: '/integer-base-converter',
  keywords: [
    'base',
    'radix',
    'binary',
    'hex',
    'octal',
    'decimal',
    'bigint',
    '进制',
    '二进制',
    '十六进制',
  ],
  icon: Binary,
  component: () => import('./IntegerBaseConverter'),
  createdAt: '2026-09-19',
})
