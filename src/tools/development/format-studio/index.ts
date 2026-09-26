import { ArrowRightLeft } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'format-studio',
  path: '/format-studio',
  keywords: [
    'format',
    'convert',
    'json',
    'yaml',
    'toml',
    'xml',
    'csv',
    'markdown',
    'html',
    'sql',
    'minify',
    'beautify',
    'comment',
    '格式',
    '转换',
    '格式化',
    '美化',
    '压缩',
    '注释',
  ],
  icon: ArrowRightLeft,
  component: () => import('./FormatStudio'),
  createdAt: '2026-09-19',
  // 左右分栏工作台，6xl 容器会把两栏挤窄
  wide: true,
  // 合并前的「代码格式化」「格式转换」以及更早的拆分工具路径，全部重定向到这里
  redirectFrom: [
    'code-formatter',
    'format-converter',
    'json-viewer',
    'json-minify',
    'json-to-csv',
    'sql-prettify',
    'xml-formatter',
    'yaml-viewer',
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
