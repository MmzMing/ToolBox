import { Scissors } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'gif-editor',
  path: '/gif-editor',
  keywords: [
    'gif editor',
    'edit gif',
    'gif frames',
    'delete gif frames',
    'reverse gif',
    'boomerang gif',
    'gif to png',
    'gif 编辑',
    '逐帧',
    '动图编辑',
    'gif 拆帧',
    '倒放',
  ],
  icon: Scissors,
  component: () => import('./GifEditor'),
  immersive: true,
  createdAt: '2026-10-01',
})
