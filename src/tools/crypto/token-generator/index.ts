import { KeyRound } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'token-generator',
  path: '/token-generator',
  keywords: ['token', 'random', 'secure', 'api-key', 'password', '令牌', '随机', '安全', '密钥'],
  icon: KeyRound,
  component: () => import('./TokenGenerator'),
  createdAt: '2026-09-19',
})
