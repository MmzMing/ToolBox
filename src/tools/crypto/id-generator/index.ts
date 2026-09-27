import { Fingerprint } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'id-generator',
  path: '/id-generator',
  keywords: [
    'uuid',
    'guid',
    'ulid',
    'v1',
    'v3',
    'v4',
    'v5',
    'v6',
    'v7',
    'nil',
    'rfc 9562',
    'rfc 4122',
    'identifier',
    'unique id',
    'sortable',
    'namespace',
    'parse',
    'validate',
    'random',
    '标识符',
    '唯一',
    '有序',
    '随机',
    '命名空间',
    '解析',
    '校验',
  ],
  icon: Fingerprint,
  component: () => import('./IdGenerator'),
  createdAt: '2026-09-27',
  // 合并前的两个路径重定向到这里，别让同一个搜索意图散在两个 URL 上
  redirectFrom: ['uuid-generator', 'ulid-generator'],
})
