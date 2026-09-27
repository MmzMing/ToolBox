import { Network } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'dns-lookup',
  path: '/dns-lookup',
  keywords: [
    'dns',
    'lookup',
    'resolve',
    'record',
    'mx',
    'txt',
    'spf',
    'caa',
    '域名解析',
    '解析查询',
    'DNS记录',
    'MX记录',
    'SPF',
  ],
  icon: Network,
  component: () => import('./DnsLookup'),
  createdAt: '2026-09-27',
})
