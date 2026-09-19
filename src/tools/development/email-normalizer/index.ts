import { Mail } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'email-normalizer',
  path: '/email-normalizer',
  keywords: [
    'email',
    'mail',
    'normalize',
    'gmail',
    'plus',
    'dot',
    'alias',
    '邮箱',
    '规范化',
    '去重',
  ],
  icon: Mail,
  component: () => import('./EmailNormalizer'),
  createdAt: '2026-09-19',
})
