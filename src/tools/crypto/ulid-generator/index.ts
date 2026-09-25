import { ArrowDownWideNarrow } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'ulid-generator',
  path: '/ulid-generator',
  keywords: [
    'ulid',
    'uuid',
    'identifier',
    'sortable',
    'timestamp',
    '标识符',
    '唯一',
    '排序',
    '时间戳',
  ],
  icon: ArrowDownWideNarrow,
  component: () => import('./UlidGenerator'),
  createdAt: '2026-09-19',
})
