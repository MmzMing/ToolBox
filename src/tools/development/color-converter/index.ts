import { Palette } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'color-converter',
  path: '/color-converter',
  keywords: ['color', 'hex', 'rgb', 'hsl', 'hwb', 'lch', 'cmyk', 'picker', '颜色', '色彩', '取色'],
  icon: Palette,
  component: () => import('./ColorConverter'),
  createdAt: '2026-09-19',
})
