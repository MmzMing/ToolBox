import { Link2 } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'slugify-string',
  path: '/slugify-string',
  keywords: ['slug', 'url', 'kebab', 'snake', 'seo', 'slugify', 'slug 生成', '短横线', '下划线'],
  icon: Link2,
  component: () => import('./SlugifyString'),
  createdAt: '2026-09-19',
})
