import { Minimize2 } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'image-compressor',
  path: '/image-compressor',
  keywords: [
    'image',
    'compress',
    'optimize',
    'webp',
    'jpeg',
    'png',
    'avif',
    'gif',
    '图片',
    '压缩',
    '批量',
  ],
  icon: Minimize2,
  component: () => import('./ImageCompressor'),
  createdAt: '2026-09-19',
})
