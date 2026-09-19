import { Code } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'text-to-unicode',
  path: '/text-to-unicode',
  keywords: ['unicode', 'escape', 'html-entity', 'uXXXX', '转义', '编码', '实体'],
  icon: Code,
  component: () => import('./TextToUnicode'),
  createdAt: '2026-09-19',
})
