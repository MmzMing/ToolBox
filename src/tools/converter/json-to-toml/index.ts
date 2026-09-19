import { FileDown } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'json-to-toml',
  path: '/json-to-toml',
  keywords: ['json', 'toml', 'convert', 'json转toml', '转换', '配置文件'],
  icon: FileDown,
  component: () => import('./JsonToToml'),
  createdAt: '2026-09-19',
})
