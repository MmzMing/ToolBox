import { Link } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'url-encoder',
  path: '/url-encoder',
  keywords: ['url', 'encode', 'decode', 'encodeURIComponent', 'percent', '编码', '解码', '转义'],
  icon: Link,
  component: () => import('./UrlEncoder'),
  createdAt: '2026-09-19',
})
