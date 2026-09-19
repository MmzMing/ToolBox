import { Timer } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'chronometer',
  path: '/chronometer',
  keywords: ['chronometer', 'stopwatch', 'timer', '秒表', '计时器', '计次', 'lap', 'time'],
  icon: Timer,
  component: () => import('./Chronometer'),
  createdAt: '2026-09-19',
})
