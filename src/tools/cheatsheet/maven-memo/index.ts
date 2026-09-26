import { Feather } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'maven-memo',
  path: '/maven-memo',
  keywords: [
    'maven',
    'mvn',
    'pom',
    'java',
    'build',
    'cheatsheet',
    'memo',
    'apache maven',
    'maven安装',
    '依赖',
    '构建工具',
    '备忘',
    '速查',
  ],
  icon: Feather,
  component: () => import('./MavenMemo'),
  createdAt: '2026-09-26',
})
