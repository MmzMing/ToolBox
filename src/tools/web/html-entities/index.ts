import { Ampersand } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'html-entities',
  path: '/html-entities',
  keywords: ['html', 'entities', 'escape', 'unescape', '实体', '转义', '反转义', '编码'],
  icon: Ampersand,
  component: () => import('./HtmlEntities'),
  createdAt: '2026-09-19',
})
