import { Container } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'docker-memo',
  path: '/docker-memo',
  keywords: [
    'docker',
    'container',
    'compose',
    'image',
    '1panel',
    'cheatsheet',
    'memo',
    '容器',
    '镜像',
    '部署面板',
    '备忘',
    '速查',
  ],
  icon: Container,
  component: () => import('./DockerMemo'),
  createdAt: '2026-09-26',
})
