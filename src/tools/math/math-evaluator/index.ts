import { Sigma } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'math-evaluator',
  path: '/math-evaluator',
  keywords: [
    'math',
    'calculator',
    'expression',
    'mathjs',
    'evaluate',
    '计算器',
    '表达式',
    '求值',
    '数学',
  ],
  icon: Sigma,
  component: () => import('./MathEvaluator'),
  createdAt: '2026-09-19',
})
