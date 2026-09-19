import { Network } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'ipv4-subnet-calculator',
  path: '/ipv4-subnet-calculator',
  keywords: [
    'ipv4',
    'subnet',
    'cidr',
    'netmask',
    'broadcast',
    '子网',
    '掩码',
    '网络地址',
    '广播地址',
    '可用主机',
  ],
  icon: Network,
  component: () => import('./Ipv4SubnetCalculator'),
  createdAt: '2026-09-19',
})
