import { CaseSensitive } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'case-converter',
  path: '/case-converter',
  keywords: [
    'case',
    'naming',
    'camelcase',
    'pascalcase',
    'snake-case',
    'kebab-case',
    '命名',
    '命名转换',
    '大小写',
    '驼峰',
  ],
  icon: CaseSensitive,
  component: () => import('./CaseConverter'),
  createdAt: '2026-09-19',
})
