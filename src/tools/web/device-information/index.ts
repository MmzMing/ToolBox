import { MonitorSmartphone } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'device-information',
  path: '/device-information',
  keywords: [
    'device',
    'navigator',
    'user agent',
    'screen',
    'viewport',
    '设备',
    '屏幕',
    '浏览器信息',
    '分辨率',
  ],
  icon: MonitorSmartphone,
  component: () => import('./DeviceInformation'),
  createdAt: '2026-09-19',
})
