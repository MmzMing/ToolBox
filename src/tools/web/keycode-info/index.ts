import { Keyboard } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'keycode-info',
  path: '/keycode-info',
  keywords: ['keycode', 'key', 'code', 'keyboard', 'event', '按键', '键盘', '键码'],
  icon: Keyboard,
  component: () => import('./KeycodeInfo'),
  createdAt: '2026-09-19',
})
