import { Boxes } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'nvm-memo',
  path: '/nvm-memo',
  keywords: [
    'nvm',
    'nvm-windows',
    'node',
    'nodejs',
    'version',
    'npm',
    'cheatsheet',
    'memo',
    'node版本管理',
    '多版本',
    '备忘',
    '速查',
  ],
  icon: Boxes,
  component: () => import('./NvmMemo'),
  createdAt: '2026-09-26',
})
