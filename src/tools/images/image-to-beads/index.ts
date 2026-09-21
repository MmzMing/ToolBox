import { Grid3x3 } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'image-to-beads',
  path: '/image-to-beads',
  keywords: [
    'beads',
    'perler',
    'hama',
    'artkal',
    'pixel art',
    'pattern',
    '拼豆',
    '烫豆',
    '像素画',
    '图纸',
    '色号',
  ],
  icon: Grid3x3,
  component: () => import('./ImageToBeads'),
  createdAt: '2026-09-21',
})
