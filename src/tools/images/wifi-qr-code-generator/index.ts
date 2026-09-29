import { Wifi } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'wifi-qr-code-generator',
  path: '/wifi-qr-code-generator',
  keywords: ['wifi', 'qr', 'qrcode', '无线', '二维码', 'wpa', 'wep', '热点'],
  icon: Wifi,
  component: () => import('./WifiQrCodeGenerator'),
  createdAt: '2026-09-19',
  // 右侧参数栏放宽到 24rem 才装得下两列字段，需要配套的宽版内容区
  wide: true,
})
