import { FileKey } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'chmod-calculator',
  path: '/chmod-calculator',
  keywords: ['chmod', 'permission', 'octal', 'rwx', 'linux', 'unix', '权限', '文件权限', '计算'],
  icon: FileKey,
  component: () => import('./ChmodCalculator'),
  createdAt: '2026-09-19',
})
