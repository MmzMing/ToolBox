import { Sparkles } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'fortune-draw',
  path: '/fortune-draw',
  keywords: ['fortune', 'draw', 'lot', 'jrys', 'luck', '运势', '抽签', '今日运势', '求签'],
  icon: Sparkles,
  component: () => import('./FortuneDraw'),
  createdAt: '2026-09-21',
})
