import { FileImage } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'base64-file-converter',
  path: '/base64-file-converter',
  keywords: ['base64', 'file', 'data-url', 'encode', 'decode', '文件', '编码', '解码'],
  icon: FileImage,
  component: () => import('./Base64FileConverter'),
  createdAt: '2026-09-19',
})
