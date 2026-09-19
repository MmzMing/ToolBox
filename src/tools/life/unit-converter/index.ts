import { Scale } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'unit-converter',
  path: '/unit-converter',
  keywords: [
    'unit',
    'convert',
    'length',
    'weight',
    'area',
    'speed',
    '单位',
    '换算',
    '长度',
    '重量',
  ],
  icon: Scale,
  component: () => import('./UnitConverter'),
  createdAt: '2026-09-19',
})
