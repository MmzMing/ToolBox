import { FileInput } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'toml-to-yaml',
  path: '/toml-to-yaml',
  keywords: ['toml', 'yaml', 'convert', 'toml转yaml', '转换', '配置文件'],
  icon: FileInput,
  component: () => import('./TomlToYaml'),
  createdAt: '2026-09-19',
})
