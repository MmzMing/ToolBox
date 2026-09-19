import { AlarmClock } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'crontab-generator',
  path: '/crontab-generator',
  keywords: [
    'cron',
    'crontab',
    'schedule',
    'expression',
    'periodic',
    '定时',
    '计划任务',
    '表达式',
    '周期',
  ],
  icon: AlarmClock,
  component: () => import('./CrontabGenerator'),
  createdAt: '2026-09-19',
})
