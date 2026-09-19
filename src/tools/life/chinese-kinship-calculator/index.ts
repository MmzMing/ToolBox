import { Users } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'chinese-kinship-calculator',
  path: '/chinese-kinship-calculator',
  keywords: ['kinship', 'family', 'relative', '亲戚', '称谓', '关系', '过年'],
  icon: Users,
  component: () => import('./ChineseKinshipCalculator'),
  createdAt: '2026-09-19',
})
