import { RadioTower } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'text-to-nato-alphabet',
  path: '/text-to-nato-alphabet',
  keywords: ['nato', 'alphabet', 'phonetic', 'spelling', '音标', '字母', '北约'],
  icon: RadioTower,
  component: () => import('./TextToNatoAlphabet'),
  createdAt: '2026-09-19',
})
