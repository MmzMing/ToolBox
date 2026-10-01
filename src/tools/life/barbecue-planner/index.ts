import { Flame } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'barbecue-planner',
  path: '/barbecue-planner',
  keywords: [
    'barbecue',
    'bbq',
    'grill',
    'skewer',
    'yakitori',
    'party',
    'shopping list',
    '烧烤',
    '烧鸟',
    '烤肉',
    '聚会',
    '采购清单',
  ],
  icon: Flame,
  component: () => import('./BarbecuePlanner'),
  createdAt: '2026-10-01',
  wide: true,
})
