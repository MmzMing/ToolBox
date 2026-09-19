import { Smile } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'emoji-picker',
  path: '/emoji-picker',
  keywords: ['emoji', 'smiley', 'unicode', 'copy', '表情', '符号', '复制'],
  icon: Smile,
  component: () => import('./EmojiPicker'),
  createdAt: '2026-09-19',
})
