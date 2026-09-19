import { Network } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'random-port-generator',
  path: '/random-port-generator',
  keywords: ['port', 'random', 'generate', 'network', 'tcp', '端口', '随机', '生成', '网络'],
  icon: Network,
  component: () => import('./RandomPortGenerator'),
  createdAt: '2026-09-19',
})
