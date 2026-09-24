import { Video } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'music-to-video',
  path: '/music-to-video',
  keywords: [
    'music to video',
    'lyric video',
    'mv',
    'audio',
    'mp4',
    'webcodecs',
    '音乐转视频',
    '歌词视频',
    '文字动画',
    '视频生成',
    '导出',
  ],
  icon: Video,
  component: () => import('./MusicToVideo'),
  createdAt: '2026-09-23',
  immersive: true,
})
