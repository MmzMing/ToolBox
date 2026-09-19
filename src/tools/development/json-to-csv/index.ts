import { Table } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'json-to-csv',
  path: '/json-to-csv',
  keywords: ['json', 'csv', 'convert', 'spreadsheet', 'excel', '转换', '表格', '导出'],
  icon: Table,
  component: () => import('./JsonToCsv'),
  createdAt: '2026-09-19',
})
