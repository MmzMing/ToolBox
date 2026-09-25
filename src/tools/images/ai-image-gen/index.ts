import { Sparkles } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'ai-image-gen',
  path: '/ai-image-gen',
  keywords: [
    'ai image',
    'image generation',
    'text to image',
    'nano banana',
    'gpt-image',
    'reverse prompt',
    'canvas',
    'AI 生图',
    '文生图',
    '反推提示词',
    '画布',
  ],
  icon: Sparkles,
  component: () => import('./AiImageGen'),
  createdAt: '2026-09-22',
  immersive: true,
})
