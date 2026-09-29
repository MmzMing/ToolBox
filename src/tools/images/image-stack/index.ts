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
    'split',
    'slice',
    'nine grid',
    'crop',
    'aspect ratio',
    '图片拼接',
    '拼图',
    '图片堆叠',
    '长图',
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
  // 右侧模板栏与样式栏合并成一整块分段面板，需要 24rem 才排得下两列滑块
  wide: true,
})
