import { CodeXml } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'json-to-xml',
  path: '/json-to-xml',
  keywords: ['json', 'xml', 'convert', 'build', 'json转xml', '转换'],
  icon: CodeXml,
  component: () => import('./JsonToXml'),
  createdAt: '2026-09-19',
})
