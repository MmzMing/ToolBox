import { Server } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'http-status-codes',
  path: '/http-status-codes',
  keywords: ['http', 'status', 'code', '404', '500', '状态码', 'HTTP', '响应'],
  icon: Server,
  component: () => import('./HttpStatusCodes'),
  createdAt: '2026-09-19',
})
