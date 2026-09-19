import { Braces } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'text-to-binary',
  path: '/text-to-binary',
  keywords: ['binary', 'hex', 'utf-8', 'text', '二进制', '十六进制', '编码'],
  icon: Braces,
  component: () => import('./TextToBinary'),
  createdAt: '2026-09-19',
})
