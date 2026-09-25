import { Gauge } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'password-strength-analyser',
  path: '/password-strength-analyser',
  keywords: [
    'password',
    'strength',
    'entropy',
    'crack-time',
    'security',
    '密码',
    '强度',
    '熵',
    '破解时间',
    '安全',
  ],
  icon: Gauge,
  component: () => import('./PasswordStrengthAnalyser'),
  createdAt: '2026-09-19',
})
