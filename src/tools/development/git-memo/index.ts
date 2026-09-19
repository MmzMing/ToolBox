import { GitBranch } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'git-memo',
  path: '/git-memo',
  keywords: ['git', 'cheatsheet', 'memo', 'command', 'reference', 'git命令', '备忘', '速查'],
  icon: GitBranch,
  component: () => import('./GitMemo'),
  createdAt: '2026-09-19',
})
