import { FileCog } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'yaml-viewer',
  path: '/yaml-viewer',
  keywords: ['yaml', 'yml', 'format', 'beautify', 'validate', '美化', '格式化', '校验'],
  icon: FileCog,
  component: () => import('./YamlViewer'),
  createdAt: '2026-09-19',
})
