import { UserKey } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'basic-auth-generator',
  path: '/basic-auth-generator',
  keywords: [
    'basic auth',
    'authorization',
    'base64',
    'http header',
    '认证',
    '请求头',
    '凭证',
    '授权',
  ],
  icon: UserKey,
  component: () => import('./BasicAuthGenerator'),
  createdAt: '2026-09-19',
})
