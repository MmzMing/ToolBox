import { ArrowRightFromLine } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'yaml-to-json-converter',
  path: '/yaml-to-json-converter',
  keywords: ['yaml', 'json', 'convert', 'parse', 'yaml转json', '序列化', '配置'],
  icon: ArrowRightFromLine,
  component: () => import('./YamlToJsonConverter'),
  createdAt: '2026-09-19',
})
