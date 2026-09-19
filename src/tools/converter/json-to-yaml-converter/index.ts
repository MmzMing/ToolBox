import { ArrowLeftToLine } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'json-to-yaml-converter',
  path: '/json-to-yaml-converter',
  keywords: ['json', 'yaml', 'convert', 'stringify', 'json转yaml', '序列化', '配置'],
  icon: ArrowLeftToLine,
  component: () => import('./JsonToYamlConverter'),
  createdAt: '2026-09-19',
})
