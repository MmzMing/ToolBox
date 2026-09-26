import { WrapText } from 'lucide-react'

import { defineTool } from '../../define-tool'

export const tool = defineTool({
  name: 'text-formatter',
  path: '/text-formatter',
  keywords: [
    'text formatter',
    'text processing',
    'batch replace',
    'dedupe lines',
    'sort lines',
    'case convert',
    'camelCase',
    'snake_case',
    'word count',
    '文本格式化',
    '文本处理',
    '快捷规则',
    '批量',
    '去重',
    '排序',
    '命名转换',
    '命名风格',
    '大小写',
    '列表转换',
    '分隔符',
    '字数',
    '字符数',
    '文本统计',
    '行数',
  ],
  icon: WrapText,
  component: () => import('./TextFormatter'),
  createdAt: '2026-09-26',
  // 64 条规则 + 左右分栏，默认 6xl 容器会把两栏挤得太窄
  wide: true,
  // 三个旧工具合并进来：文本统计、命名转换与列表转换
  redirectFrom: ['text-statistics', 'case-converter', 'list-converter'],
})
