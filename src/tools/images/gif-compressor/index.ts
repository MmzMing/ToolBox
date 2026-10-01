import { GifCompressIcon } from '@/components/icons/gif-compress-icon'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'gif-compressor',
  path: '/gif-compressor',
  keywords: [
    'gif',
    'compress gif',
    'gif compressor',
    'reduce gif size',
    'lossy gif',
    'slack emoji',
    'discord sticker',
    '动图压缩',
    'gif 压缩',
    'gif 变小',
    '微信表情',
  ],
  icon: GifCompressIcon,
  component: () => import('./GifCompressor'),
  createdAt: '2026-10-01',
})
