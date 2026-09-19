import { Minimize2 } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'json-minify',
  path: '/json-minify',
  keywords: ['json', 'minify', 'compress', 'compact', 'whitespace', '压缩', '精简'],
  icon: Minimize2,
  component: () => import('./JsonMinify'),
  createdAt: '2026-09-19',
})
