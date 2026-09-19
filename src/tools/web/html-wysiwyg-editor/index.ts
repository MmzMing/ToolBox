import { PenLine } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'html-wysiwyg-editor',
  path: '/html-wysiwyg-editor',
  keywords: ['wysiwyg', 'html', 'editor', 'rich text', 'contenteditable', '富文本', '编辑器'],
  icon: PenLine,
  component: () => import('./HtmlWysiwygEditor'),
  createdAt: '2026-09-19',
})
