import { ArrowRightLeft } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'format-converter',
  path: '/format-converter',
  keywords: [
    'convert',
    'format',
    'yaml',
    'json',
    'toml',
    'xml',
    'markdown',
    'html',
    '格式',
    '转换',
  ],
  icon: ArrowRightLeft,
  component: () => import('./FormatConverter'),
  createdAt: '2026-09-19',
  // 旧拆分工具路径全部重定向到合并页
  redirectFrom: [
    'yaml-to-json-converter',
    'json-to-yaml-converter',
    'yaml-to-toml',
    'toml-to-yaml',
    'json-to-toml',
    'toml-to-json',
    'xml-to-json',
    'json-to-xml',
    'markdown-to-html',
  ],
})
