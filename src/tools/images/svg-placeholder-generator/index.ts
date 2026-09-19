import { Image } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'svg-placeholder-generator',
  path: '/svg-placeholder-generator',
  keywords: ['svg', 'placeholder', '占位图', '假图', 'mock', 'image', '尺寸', '灰图'],
  icon: Image,
  component: () => import('./SvgPlaceholderGenerator'),
  createdAt: '2026-09-19',
})
