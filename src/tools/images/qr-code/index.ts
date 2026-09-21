import { QrCode } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'qr-code',
  path: '/qr-code',
  keywords: [
    'qr',
    'qrcode',
    'generate',
    'decode',
    'scan',
    '二维码',
    '生成',
    '识别',
    '解析',
    '扫码',
    '纠错',
    'png',
    'svg',
  ],
  icon: QrCode,
  component: () => import('./QrCode'),
  createdAt: '2026-09-19',
})
