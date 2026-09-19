import { PiggyBank } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'social-insurance-calculator',
  path: '/social-insurance-calculator',
  keywords: ['five insurances', 'housing fund', 'salary', '五险一金', '社保', '公积金', '工资'],
  icon: PiggyBank,
  component: () => import('./SocialInsuranceCalculator'),
  createdAt: '2026-09-19',
})
