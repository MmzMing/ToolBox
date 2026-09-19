import { AppWindow } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'user-agent-parser',
  path: '/user-agent-parser',
  keywords: ['user-agent', 'ua', 'browser', 'device', 'os', 'UA 解析', '浏览器', '设备'],
  icon: AppWindow,
  component: () => import('./UserAgentParser'),
  createdAt: '2026-09-19',
})
