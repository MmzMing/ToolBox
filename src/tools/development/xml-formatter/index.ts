import { FileCode } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'xml-formatter',
  path: '/xml-formatter',
  keywords: ['xml', 'format', 'indent', 'beautify', 'pretty', '格式化', '缩进', '美化'],
  icon: FileCode,
  component: () => import('./XmlFormatter'),
  createdAt: '2026-09-19',
})
