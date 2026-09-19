import { Camera } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'camera-recorder',
  path: '/camera-recorder',
  keywords: ['camera', 'webcam', 'recorder', '摄像头', '录制', '拍照', '麦克风', 'media', 'webm'],
  icon: Camera,
  component: () => import('./CameraRecorder'),
  createdAt: '2026-09-19',
})
