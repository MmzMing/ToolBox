import { CalendarClock } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'date-time-converter',
  path: '/date-time-converter',
  keywords: [
    'date',
    'time',
    'timestamp',
    'iso',
    'utc',
    'unix',
    'batch',
    'extract',
    'timeline',
    '日期',
    '时间',
    '时间戳',
    '批量提取',
    '时间线',
  ],
  icon: CalendarClock,
  component: () => import('./DateTimeConverter'),
  createdAt: '2026-09-19',
  wide: true,
})
