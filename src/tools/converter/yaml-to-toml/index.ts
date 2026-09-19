import { FileOutput } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'yaml-to-toml',
  path: '/yaml-to-toml',
  keywords: ['yaml', 'toml', 'convert', 'yaml转toml', '转换', '配置文件'],
  icon: FileOutput,
  component: () => import('./YamlToToml'),
  createdAt: '2026-09-19',
})
