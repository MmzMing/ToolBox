import { ListFilter } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'list-converter',
  path: '/list-converter',
  keywords: ['list', 'dedupe', 'sort', 'reverse', 'join', 'split', '列表', '去重', '排序'],
  icon: ListFilter,
  component: () => import('./ListConverter'),
  createdAt: '2026-09-19',
})
