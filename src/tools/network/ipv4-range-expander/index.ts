import { ArrowRightLeft } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'ipv4-range-expander',
  path: '/ipv4-range-expander',
  keywords: [
    'ipv4',
    'cidr',
    'range',
    'ip-range',
    'expander',
    'IP 范围',
    '地址段',
    '展开',
    'CIDR 列表',
  ],
  icon: ArrowRightLeft,
  component: () => import('./Ipv4RangeExpander'),
  createdAt: '2026-09-19',
})
