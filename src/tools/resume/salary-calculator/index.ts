import { Wallet } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'salary-calculator',
  path: '/salary-calculator',
  keywords: [
    'salary',
    'take-home pay',
    'cost of living',
    'income tax',
    'iit',
    'social insurance',
    'housing fund',
    'year-end bonus',
    'offer',
    '到手工资',
    '税后工资',
    '工资计算器',
    '个税计算器',
    '社保计算器',
    '五险一金',
    '生活成本',
    '年终奖',
    '谈薪',
  ],
  icon: Wallet,
  component: () => import('./SalaryCalculator'),
  createdAt: '2026-09-28',
  // 左输入右结果的双栏工作台，默认 6xl 容器会把结果区的明细表挤窄
  wide: true,
  // 并入前的旧路径重定向到这里，同一个搜索意图不散在两个 URL 上
  redirectFrom: ['social-insurance-calculator'],
})
