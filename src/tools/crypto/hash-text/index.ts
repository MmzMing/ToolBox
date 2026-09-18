import { Hash } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'hash-text',
  path: '/hash-text',
  keywords: ['hash', 'md5', 'sha1', 'sha256', 'sha512', '哈希', '摘要', '校验'],
  icon: Hash,
  component: () => import('./HashText'),
  createdAt: '2026-09-19',
})
