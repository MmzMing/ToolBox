import { FileSignature } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'pdf-signature-checker',
  path: '/pdf-signature-checker',
  keywords: [
    'pdf',
    'signature',
    'byte-range',
    'acroform',
    'sign',
    '签名',
    '数字签名',
    '证书',
    '文件校验',
  ],
  icon: FileSignature,
  component: () => import('./PdfSignatureChecker'),
  createdAt: '2026-09-19',
})
