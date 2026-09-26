import { Terminal } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'curl-generator',
  path: '/curl-generator',
  keywords: [
    'curl',
    'command',
    'http',
    'request',
    'api',
    'headers',
    'devtools',
    'cURL 命令生成',
    'curl 转代码',
    '请求头',
    '接口调试',
  ],
  icon: Terminal,
  component: () => import('./CurlGenerator'),
  createdAt: '2026-09-26',
  // 左表单 + 右输出的工作台，max-w-6xl 会把命令区挤到横向滚动
  wide: true,
})
