import { Images } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'image-stack',
  path: '/image-stack',
  keywords: [
    'image stack',
    'collage',
    'photo grid',
    'stitch',
    'merge',
    'long image',
    'long screenshot',
    'scrolling screenshot',
    'subtitle stack',
    'split',
    'slice',
    'nine grid',
    'crop',
    'aspect ratio',
    '图片拼接',
    '拼图',
    '图片堆叠',
    '长图',
    '超长图',
    '滚动截图',
    '字幕堆叠',
    '海报',
    '九宫格',
    '图片拆分',
    '切图',
    '裁切',
    '画布比例',
  ],
  icon: Images,
  component: () => import('./ImageStack'),
  createdAt: '2026-09-25',
  // 模板栏/样式栏与长图配置栏都要排得下两列滑块，窄了会挤成一行一个
  wide: true,
})
