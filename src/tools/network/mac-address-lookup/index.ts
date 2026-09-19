import { SearchCheck } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'mac-address-lookup',
  path: '/mac-address-lookup',
  keywords: ['mac', 'oui', 'vendor', 'nic', 'hardware', 'MAC 地址', '厂商', '网卡', '查询'],
  icon: SearchCheck,
  component: () => import('./MacAddressLookup'),
  createdAt: '2026-09-19',
})
