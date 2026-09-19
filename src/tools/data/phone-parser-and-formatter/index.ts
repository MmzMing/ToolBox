import { Phone } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'phone-parser-and-formatter',
  path: '/phone-parser-and-formatter',
  keywords: ['phone', 'telephone', 'e164', 'libphonenumber', 'format', '电话', '手机号', '格式化'],
  icon: Phone,
  component: () => import('./PhoneParserAndFormatter'),
  createdAt: '2026-09-19',
})
