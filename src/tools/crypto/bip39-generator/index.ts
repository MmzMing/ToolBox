import { BookOpenText } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'bip39-generator',
  path: '/bip39-generator',
  keywords: ['bip39', 'mnemonic', 'seed', 'wallet', 'bitcoin', '助记词', '钱包', '比特币', '种子'],
  icon: BookOpenText,
  component: () => import('./Bip39Generator'),
  createdAt: '2026-09-19',
})
