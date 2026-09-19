import { ArrowLeftRight } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'ipv4-address-converter',
  path: '/ipv4-address-converter',
  keywords: [
    'ipv4',
    'decimal',
    'hex',
    'binary',
    'octal',
    'converter',
    '进制转换',
    '点分十进制',
    '十六进制',
  ],
  icon: ArrowLeftRight,
  component: () => import('./Ipv4AddressConverter'),
  createdAt: '2026-09-19',
})
