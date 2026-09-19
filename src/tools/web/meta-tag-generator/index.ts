import { Tags } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'meta-tag-generator',
  path: '/meta-tag-generator',
  keywords: ['meta', 'opengraph', 'og', 'twitter card', 'seo', '标签', '分享', '社交'],
  icon: Tags,
  component: () => import('./MetaTagGenerator'),
  createdAt: '2026-09-19',
})
