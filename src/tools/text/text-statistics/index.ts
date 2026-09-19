import { ChartBarBig } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'text-statistics',
  path: '/text-statistics',
  keywords: [
    'text',
    'statistics',
    'word count',
    'chars',
    'reading time',
    '文本统计',
    '字数',
    '阅读时长',
  ],
  icon: ChartBarBig,
  component: () => import('./TextStatistics'),
  createdAt: '2026-09-19',
})
