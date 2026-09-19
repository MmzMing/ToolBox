import { FileCode } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'toml-to-json',
  path: '/toml-to-json',
  keywords: ['toml', 'json', 'convert', 'toml转json', '转换', '配置文件'],
  icon: FileCode,
  component: () => import('./TomlToJson'),
  createdAt: '2026-09-19',
})
