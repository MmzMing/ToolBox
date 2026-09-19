import { ShieldQuestion } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'safelink-decoder',
  path: '/safelink-decoder',
  keywords: ['safelink', 'redirect', 'unwrap', 'decode', 'url', '跳转', '重定向', '解码'],
  icon: ShieldQuestion,
  component: () => import('./SafelinkDecoder'),
  createdAt: '2026-09-19',
})
