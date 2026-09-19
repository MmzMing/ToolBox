import { Paintbrush } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'ascii-text-drawer',
  path: '/ascii-text-drawer',
  keywords: ['ascii', 'art', 'banner', 'figlet', 'text', 'ASCII', '字符画', '艺术字'],
  icon: Paintbrush,
  component: () => import('./AsciiTextDrawer'),
  createdAt: '2026-09-19',
})
