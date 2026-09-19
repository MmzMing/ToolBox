import { Binary } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'encoder-decoder',
  path: '/encoder-decoder',
  keywords: [
    'encode',
    'decode',
    'encoder',
    'decoder',
    'base64',
    'btoa',
    'atob',
    'jwt',
    'token',
    'url',
    'encodeURIComponent',
    'percent',
    'unicode',
    'escape',
    'html-entity',
    'binary',
    'hex',
    'utf-8',
    '编码',
    '解码',
    '转义',
    '令牌',
    '过期',
    '二进制',
    '十六进制',
    '实体',
  ],
  icon: Binary,
  component: () => import('./EncoderDecoder'),
  createdAt: '2026-09-19',
  // 旧拆分工具路径全部重定向到合并页
  redirectFrom: [
    'base64-string-converter',
    'jwt-parser',
    'url-encoder',
    'text-to-unicode',
    'text-to-binary',
  ],
})
