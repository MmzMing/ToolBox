import { QrCode } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'qr-code-generator',
  path: '/qr-code-generator',
  keywords: ['qr', 'qrcode', '二维码', '生成', '扫码', '纠错', 'png', 'svg'],
  icon: QrCode,
  component: () => import('./QrCodeGenerator'),
  createdAt: '2026-09-19',
})
