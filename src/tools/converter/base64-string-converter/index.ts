import { FileDigit } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'base64-string-converter',
  path: '/base64-string-converter',
  keywords: ['base64', 'encode', 'decode', 'btoa', 'atob', '编码', '解码'],
  icon: FileDigit,
  component: () => import('./Base64StringConverter'),
  createdAt: '2026-09-19',
})
