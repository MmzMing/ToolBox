import { FileKey } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'encryption',
  path: '/encryption',
  keywords: ['aes', 'encrypt', 'decrypt', 'cipher', 'secret', '加密', '解密', '对称', '密文'],
  icon: FileKey,
  component: () => import('./Encryption'),
  createdAt: '2026-09-19',
})
