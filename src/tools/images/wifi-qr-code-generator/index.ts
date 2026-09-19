import { Wifi } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'wifi-qr-code-generator',
  path: '/wifi-qr-code-generator',
  keywords: ['wifi', 'qr', 'qrcode', '无线', '二维码', 'wpa', 'wep', '热点'],
  icon: Wifi,
  component: () => import('./WifiQrCodeGenerator'),
  createdAt: '2026-09-19',
})
