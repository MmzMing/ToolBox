import { Fingerprint } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'mac-address-generator',
  path: '/mac-address-generator',
  keywords: ['mac', 'random', 'generator', 'address', 'MAC 地址', '随机', '生成', '网卡地址'],
  icon: Fingerprint,
  component: () => import('./MacAddressGenerator'),
  createdAt: '2026-09-19',
})
