import { Database } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'sql-memo',
  path: '/sql-memo',
  keywords: [
    'sql',
    'mysql',
    'postgresql',
    'database',
    'query',
    'select',
    'join',
    'group by',
    'index',
    'transaction',
    'window function',
    'explain',
    'cheatsheet',
    'memo',
    'sql语法',
    'sql语句',
    '数据库',
    '语句查询',
    '索引',
    '事务',
    '窗口函数',
    '建表',
    '备忘',
    '速查',
  ],
  icon: Database,
  component: () => import('./SqlMemo'),
  createdAt: '2026-09-27',
})
