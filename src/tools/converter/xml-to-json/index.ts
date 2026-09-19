import { FileBraces } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'xml-to-json',
  path: '/xml-to-json',
  keywords: ['xml', 'json', 'convert', 'parse', 'xml转json', '转换'],
  icon: FileBraces,
  component: () => import('./XmlToJson'),
  createdAt: '2026-09-19',
})
