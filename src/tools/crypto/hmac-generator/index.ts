import { ShieldCheck } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'hmac-generator',
  path: '/hmac-generator',
  keywords: ['hmac', 'md5', 'sha1', 'sha256', 'sha512', 'mac', '消息认证码', '签名', '密钥'],
  icon: ShieldCheck,
  component: () => import('./HmacGenerator'),
  createdAt: '2026-09-19',
})
