import { Braces } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'code-formatter',
  path: '/code-formatter',
  keywords: ['format', 'json', 'sql', 'xml', 'yaml', 'csv', 'minify', '格式化', '美化', '压缩'],
  icon: Braces,
  component: () => import('./CodeFormatter'),
  createdAt: '2026-09-19',
  // 旧拆分工具路径全部重定向到合并页
  redirectFrom: [
    'json-viewer',
    'json-minify',
    'json-to-csv',
    'sql-prettify',
    'xml-formatter',
    'yaml-viewer',
  ],
})
