import { LockKeyhole } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'bcrypt',
  path: '/bcrypt',
  keywords: ['bcrypt', 'hash', 'password', 'salt', 'encrypt', '密码', '哈希', '加密', '校验'],
  icon: LockKeyhole,
  component: () => import('./Bcrypt'),
  createdAt: '2026-09-19',
})
