import { Fingerprint } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'uuid-generator',
  path: '/uuid-generator',
  keywords: ['uuid', 'guid', 'v4', 'random', '标识符', '随机'],
  icon: Fingerprint,
  component: () => import('./UuidGenerator'),
  createdAt: '2026-09-19',
})
