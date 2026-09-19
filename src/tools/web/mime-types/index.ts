import { FileType } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'mime-types',
  path: '/mime-types',
  keywords: [
    'mime',
    'content type',
    'content-type',
    'file extension',
    '类型',
    '扩展名',
    '文件类型',
  ],
  icon: FileType,
  component: () => import('./MimeTypes'),
  createdAt: '2026-09-19',
})
