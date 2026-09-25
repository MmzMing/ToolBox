import { Regex } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'regex-memo',
  path: '/regex-memo',
  keywords: ['regex', 'cheatsheet', 'memo', 'reference', 'syntax', '正则', '备忘', '速查', '语法'],
  icon: Regex,
  component: () => import('./RegexMemo'),
  createdAt: '2026-09-19',
})
