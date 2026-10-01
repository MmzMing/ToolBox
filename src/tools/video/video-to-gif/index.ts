import { VideoToGifIcon } from '@/components/icons/video-to-gif-icon'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'video-to-gif',
  path: '/video-to-gif',
  keywords: [
    'video to gif',
    'mp4 to gif',
    'mov to gif',
    'webm to gif',
    'video converter',
    'trim gif',
    '视频转 gif',
    'mp4 转 gif',
    '视频转动画',
    '本地转换',
  ],
  icon: VideoToGifIcon,
  component: () => import('./VideoToGif'),
  createdAt: '2026-10-01',
})
