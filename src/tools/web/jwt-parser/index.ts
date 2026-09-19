import { KeyRound } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'jwt-parser',
  path: '/jwt-parser',
  keywords: ['jwt', 'token', 'decode', 'header', 'payload', 'exp', '令牌', '解码', '过期'],
  icon: KeyRound,
  component: () => import('./JwtParser'),
  createdAt: '2026-09-19',
})
