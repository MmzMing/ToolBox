import { GifMakerIcon } from '@/components/icons/gif-maker-icon'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'gif-maker',
  path: '/gif-maker',
  keywords: [
    'gif maker',
    'make gif',
    'images to gif',
    'photo to gif',
    'animated gif',
    'frame delay',
    '图片转 gif',
    '图片合成 gif',
    '制作动图',
    '动图生成',
  ],
  icon: GifMakerIcon,
  component: () => import('./GifMaker'),
  createdAt: '2026-10-01',
})
