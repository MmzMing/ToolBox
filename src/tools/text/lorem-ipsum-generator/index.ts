import { AlignLeft } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'lorem-ipsum-generator',
  path: '/lorem-ipsum-generator',
  keywords: ['lorem', 'ipsum', 'placeholder', 'dummy', 'text', '假文', '占位文本', '乱数假文'],
  icon: AlignLeft,
  component: () => import('./LoremIpsumGenerator'),
  createdAt: '2026-09-19',
})
