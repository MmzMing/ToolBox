import { KeyRound } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'rsa-key-pair-generator',
  path: '/rsa-key-pair-generator',
  keywords: [
    'rsa',
    'key-pair',
    'public-key',
    'private-key',
    'pem',
    '公钥',
    '私钥',
    '非对称',
    '密钥对',
  ],
  icon: KeyRound,
  component: () => import('./RsaKeyPairGenerator'),
  createdAt: '2026-09-19',
})
