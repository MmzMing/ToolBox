import { Rocket } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'github-accelerator',
  path: '/github-accelerator',
  keywords: [
    'github',
    'ghproxy',
    'gh proxy',
    'accelerate',
    'download',
    'release',
    'raw',
    'archive',
    'jsdelivr',
    '加速',
    '下载',
    '镜像',
    '代理',
  ],
  icon: Rocket,
  component: () => import('./GithubAccelerator'),
  createdAt: '2026-09-19',
})
