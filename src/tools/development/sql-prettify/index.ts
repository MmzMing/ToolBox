import { Database } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'sql-prettify',
  path: '/sql-prettify',
  keywords: ['sql', 'format', 'pretty', 'beautify', 'query', '格式化', '美化', '语句'],
  icon: Database,
  component: () => import('./SqlPrettify'),
  createdAt: '2026-09-19',
})
