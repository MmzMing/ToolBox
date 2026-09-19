import { EyeOff } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'string-obfuscator',
  path: '/string-obfuscator',
  keywords: [
    'obfuscate',
    'zero-width',
    'html entities',
    'base64',
    'reverse',
    '混淆',
    '零宽字符',
    '隐藏',
  ],
  icon: EyeOff,
  component: () => import('./StringObfuscator'),
  createdAt: '2026-09-19',
})
