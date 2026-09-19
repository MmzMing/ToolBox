import { Percent } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'percentage-calculator',
  path: '/percentage-calculator',
  keywords: [
    'percent',
    'percentage',
    'change',
    'ratio',
    'increase',
    'decrease',
    '百分比',
    '百分数',
    '占比',
    '增减',
  ],
  icon: Percent,
  component: () => import('./PercentageCalculator'),
  createdAt: '2026-09-19',
})
