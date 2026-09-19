import { Gauge } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'benchmark-builder',
  path: '/benchmark-builder',
  keywords: ['benchmark', 'performance', '基准', '性能', '测试', '耗时', '对比', 'speed'],
  icon: Gauge,
  component: () => import('./BenchmarkBuilder'),
  createdAt: '2026-09-19',
})
