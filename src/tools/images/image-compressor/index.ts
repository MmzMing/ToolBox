import { ImageCompressIcon } from '@/components/icons/image-compress-icon'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'image-compressor',
  path: '/image-compressor',
  keywords: [
    'image',
    'compress',
    'optimize',
    'webp',
    'jpeg',
    'png',
    'avif',
    'gif',
    '图片',
    '压缩',
    '批量',
  ],
  icon: ImageCompressIcon,
  component: () => import('./ImageCompressor'),
  createdAt: '2026-09-19',
  // 右侧选项栏是百分比宽度的 Resizable 面板，内容区放宽后两列字段才排得开
  wide: true,
})
