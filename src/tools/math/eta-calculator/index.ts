import { Hourglass } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'eta-calculator',
  path: '/eta-calculator',
  keywords: [
    'eta',
    'progress',
    'estimate',
    'time',
    'remaining',
    '进度',
    '剩余时间',
    '预估',
    '完成时间',
  ],
  icon: Hourglass,
  component: () => import('./EtaCalculator'),
  createdAt: '2026-09-19',
})
