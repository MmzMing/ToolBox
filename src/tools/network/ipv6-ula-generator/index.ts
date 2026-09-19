import { Globe } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'ipv6-ula-generator',
  path: '/ipv6-ula-generator',
  keywords: ['ipv6', 'ula', 'rfc4193', 'fd00', 'prefix', '私有地址', '内网', '前缀', '生成'],
  icon: Globe,
  component: () => import('./Ipv6UlaGenerator'),
  createdAt: '2026-09-19',
})
