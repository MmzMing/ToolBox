import { Braces } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'json-viewer',
  path: '/json-viewer',
  keywords: [
    'json',
    'format',
    'beautify',
    'pretty',
    'minify',
    'validate',
    '格式化',
    '美化',
    '压缩',
    '校验',
  ],
  icon: Braces,
  component: () => import('./JsonViewer'),
  createdAt: '2026-09-19',
})
