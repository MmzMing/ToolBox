import { GitCompareArrows } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'text-diff',
  path: '/text-diff',
  keywords: ['diff', 'compare', 'text', 'changes', '文本对比', '差异', '比较'],
  icon: GitCompareArrows,
  component: () => import('./TextDiff'),
  createdAt: '2026-09-19',
  // 两张卡片并排比对，容器窄了正文会频繁折行、两卡也放不下
  wide: true,
})
