import { Eraser } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'gif-bg-remover',
  path: '/gif-bg-remover',
  keywords: [
    'gif',
    'background',
    'remove background',
    'matting',
    'chroma key',
    '抠图',
    '去背景',
    '透明背景',
    '绿幕',
    '动图',
  ],
  icon: Eraser,
  component: () => import('./GifBgRemover'),
  createdAt: '2026-10-05',
  immersive: true,
})
