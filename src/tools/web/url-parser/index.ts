import { Unlink } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'url-parser',
  path: '/url-parser',
  keywords: ['url', 'parse', 'query', 'search params', '解析', '查询参数', '网址', '拆解'],
  icon: Unlink,
  component: () => import('./UrlParser'),
  createdAt: '2026-09-19',
})
