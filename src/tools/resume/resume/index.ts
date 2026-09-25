import { FileUser } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'resume',
  path: '/resume',
  keywords: ['resume', 'cv', 'curriculum vitae', '简历', '履历', '求职', '模板', 'pdf', '导出'],
  icon: FileUser,
  component: () => import('./Resume'),
  createdAt: '2026-09-19',
})
