import { GitCompare } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'json-diff',
  path: '/json-diff',
  keywords: ['json', 'diff', 'compare', 'structure', '对比', '差异', 'JSON'],
  icon: GitCompare,
  component: () => import('./JsonDiff'),
  createdAt: '2026-09-19',
})
