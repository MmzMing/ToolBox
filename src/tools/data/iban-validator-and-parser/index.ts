import { CreditCard } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'iban-validator-and-parser',
  path: '/iban-validator-and-parser',
  keywords: ['iban', 'bank', 'account', 'validate', 'sepa', 'IBAN', '银行账号', '校验'],
  icon: CreditCard,
  component: () => import('./IbanValidatorAndParser'),
  createdAt: '2026-09-19',
})
