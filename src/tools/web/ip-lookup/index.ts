import { MapPin } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'ip-lookup',
  path: '/ip-lookup',
  keywords: [
    'ip',
    'lookup',
    'geo',
    'location',
    'public ip',
    'postal code',
    '查询',
    '归属地',
    'IP',
    '邮编',
  ],
  icon: MapPin,
  component: () => import('./IpLookup'),
  createdAt: '2026-09-19',
})
