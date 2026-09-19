import { Thermometer } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'temperature-converter',
  path: '/temperature-converter',
  keywords: [
    'temperature',
    'celsius',
    'fahrenheit',
    'kelvin',
    '温度',
    '摄氏',
    '华氏',
    '开尔文',
    '转换',
  ],
  icon: Thermometer,
  component: () => import('./TemperatureConverter'),
  createdAt: '2026-09-19',
})
