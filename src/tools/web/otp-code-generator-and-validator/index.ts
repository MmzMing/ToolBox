import { ShieldHalf } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'otp-code-generator-and-validator',
  path: '/otp-code-generator-and-validator',
  keywords: [
    'otp',
    'totp',
    '2fa',
    'two-factor',
    'authenticator',
    'hmac',
    '验证码',
    '动态密码',
    '两步验证',
  ],
  icon: ShieldHalf,
  component: () => import('./OtpCodeGeneratorAndValidator'),
  createdAt: '2026-09-19',
})
