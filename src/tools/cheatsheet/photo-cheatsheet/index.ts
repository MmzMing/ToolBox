import { Camera } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'photo-cheatsheet',
  path: '/photo-cheatsheet',
  keywords: [
    'photo',
    'photography',
    'camera',
    'cheatsheet',
    'memo',
    '拍照',
    '摄影',
    '手机摄影',
    '速查表',
    '避坑',
  ],
  icon: Camera,
  component: () => import('./PhotoCheatsheet'),
  createdAt: '2026-09-19',
})
