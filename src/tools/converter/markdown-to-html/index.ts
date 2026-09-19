import { FileText } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'markdown-to-html',
  path: '/markdown-to-html',
  keywords: ['markdown', 'html', 'md', 'convert', 'markdown转html', '渲染'],
  icon: FileText,
  component: () => import('./MarkdownToHtml'),
  createdAt: '2026-09-19',
})
