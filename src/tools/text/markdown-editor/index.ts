import { FileCode } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'markdown-editor',
  path: '/markdown-editor',
  keywords: [
    'markdown',
    'md',
    'editor',
    'preview',
    'mermaid',
    'katex',
    'latex',
    'export',
    'markdown 编辑器',
    '实时预览',
    '公式',
    '图表',
    '导出 html',
    '导出 pdf',
  ],
  icon: FileCode,
  component: () => import('./MarkdownEditor'),
  createdAt: '2026-09-26',
  // 整页工作台：ToolLayout 的 fill 分支把高度链打通到视口，页内自管滚动
  immersive: true,
  // 取代 web 分类下的富文本编辑器，旧地址继续可达（sitemap 与已收录链接不失效）
  redirectFrom: ['/html-wysiwyg-editor'],
})
