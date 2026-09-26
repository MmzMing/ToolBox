/**
 * 首访示例文档，同时充当功能自检：表格、任务列表、代码高亮、mermaid、公式各出现一次。
 *
 * 逐行数组拼接而不是整块模板字符串，是因为正文里同时有反引号与 LaTeX 反斜杠——
 * 普通模板字符串会把 `\frac` 变成换页符，String.raw 又会把转义反引号的后斜杠留在正文里。
 * 只有不含反引号的公式行用 String.raw。
 */
const codeBlock = [
  '```ts',
  'export function greet(name: string): string {',
  "  return 'hi, ' + name",
  '}',
  '```',
]

const mermaidZh = [
  '```mermaid',
  'flowchart LR',
  '  A[写源码] --> B{实时预览}',
  '  B -->|满意| C[导出 HTML / PDF]',
  '  B -->|还要改| A',
  '```',
]

const mermaidEn = [
  '```mermaid',
  'flowchart LR',
  '  A[Write source] --> B{Live preview}',
  '  B -->|Good enough| C[Export HTML / PDF]',
  '  B -->|Keep editing| A',
  '```',
]

const mathBlock = String.raw`$$\int_0^{\infty} e^{-x^2}\,dx = \frac{\sqrt{\pi}}{2}$$`

export const sampleDocZh: string = [
  '# 欢迎使用 Markdown 编辑器',
  '',
  '源码在左、渲染在右，正文只存浏览器 localStorage，不上传服务器。',
  '',
  '## 常用语法',
  '',
  '**粗体**、*斜体*、~~删除线~~、`行内代码`、[链接](https://example.com)',
  '',
  '- [x] 勾选过的任务项',
  '- [ ] 待办任务项',
  '',
  '| 功能 | 快捷键 |',
  '| ---- | ------ |',
  '| 粗体 | Ctrl+B |',
  '| 插入链接 | Ctrl+K |',
  '',
  '> 引用块：正文经 marked 解析后一律过 DOMPurify 净化再进 DOM。',
  '',
  ...codeBlock,
  '',
  '## 图表',
  '',
  ...mermaidZh,
  '',
  '## 公式',
  '',
  '行内公式 $E = mc^2$，块级公式：',
  '',
  mathBlock,
  '',
  '工具栏的下拉菜单里有表格、代码块与 10 种图表模板。',
  '',
].join('\n')

export const sampleDocEn: string = [
  '# Welcome to the Markdown Editor',
  '',
  'Source on the left, rendered output on the right. Nothing leaves your browser.',
  '',
  '## Core syntax',
  '',
  '**bold**, *italic*, ~~strikethrough~~, `inline code`, [a link](https://example.com)',
  '',
  '- [x] A checked task',
  '- [ ] An open task',
  '',
  '| Feature     | Shortcut |',
  '| ----------- | -------- |',
  '| Bold        | Ctrl+B   |',
  '| Insert link | Ctrl+K   |',
  '',
  '> Blockquote: parsed markdown always passes through DOMPurify before touching the DOM.',
  '',
  ...codeBlock,
  '',
  '## Diagrams',
  '',
  ...mermaidEn,
  '',
  '## Math',
  '',
  'Inline formula $E = mc^2$ and a block formula:',
  '',
  mathBlock,
  '',
  'The toolbar dropdowns hold table, code fence and ten diagram templates.',
  '',
].join('\n')

export function pickSampleDoc(locale: string): string {
  return locale.startsWith('zh') ? sampleDocZh : sampleDocEn
}
