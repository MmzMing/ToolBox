import type { InlineMarkKind, LineBlockKind, SourceEdit, TextStats } from './markdown-editor.types'
import { sanitizeFileName } from '@/utils/file-name'

/** 行首标记：切换时先剥掉同类旧标记，再补上目标标记 */
const LINE_PREFIX_RE = /^(?:#{1,6}[ \t]|[-*+][ \t]+(?:\[[ xX]\][ \t]+)?|\d+[.)][ \t]+|>[ \t]?)/

/**
 * 「这一行已经就是这个种类」的判据，比 startsWith(prefix) 严格：
 * 任务项 `- [x] 完成` 也以 `- ` 开头，若只看前缀就永远退不成普通列表。
 */
const KIND_MATCHERS: Record<LineBlockKind, RegExp> = {
  heading1: /^#[ \t](?!#)/,
  heading2: /^##[ \t](?!#)/,
  heading3: /^###[ \t](?!#)/,
  unordered: /^[-*+][ \t]+(?!\[[ xX]\][ \t])/,
  ordered: /^\d+[.)][ \t]+/,
  task: /^[-*+][ \t]+\[[ xX]\][ \t]+/,
  quote: /^>[ \t]/,
}

const MARKS: Record<InlineMarkKind, string> = {
  bold: '**',
  italic: '*',
  strike: '~~',
  code: '`',
  math: '$',
}

export function linePrefixFor(kind: LineBlockKind): string {
  switch (kind) {
    case 'heading1':
      return '# '
    case 'heading2':
      return '## '
    case 'heading3':
      return '### '
    case 'unordered':
      return '- '
    case 'ordered':
      return '1. '
    case 'task':
      return '- [ ] '
    case 'quote':
      return '> '
  }
}

const lineStartOf = (text: string, offset: number): number =>
  text.lastIndexOf('\n', Math.max(0, offset - 1)) + 1

const lineEndOf = (text: string, offset: number): number => {
  const index = text.indexOf('\n', offset)
  return index < 0 ? text.length : index
}

/** 选区覆盖到的整行范围（左闭右开，不含结尾换行） */
export function selectionLineRange(text: string, from: number, to: number) {
  return { start: lineStartOf(text, from), end: lineEndOf(text, Math.max(from, to)) }
}

/**
 * 行级标记切换：范围内所有非空行都已带该标记则整块取消，否则统一换成该标记。
 * 有序列表按行序重排成 `1. 2. 3.`。
 */
export function buildLineBlockEdit(
  text: string,
  from: number,
  to: number,
  kind: LineBlockKind,
): SourceEdit {
  const { start, end } = selectionLineRange(text, from, to)
  const prefix = linePrefixFor(kind)
  const matcher = KIND_MATCHERS[kind]
  const lines = text.slice(start, end).split('\n')
  const filled = lines.filter((line) => line.trim() !== '')
  const alreadyOn = filled.length > 0 && filled.every((line) => matcher.test(line))

  const next = lines.map((line, index) => {
    if (line.trim() === '') {
      return line
    }
    if (alreadyOn) {
      return line.replace(matcher, '')
    }
    const body = line.replace(LINE_PREFIX_RE, '')
    return (kind === 'ordered' ? `${index + 1}. ` : prefix) + body
  })

  const insert = next.join('\n')
  return {
    changes: [{ from: start, to: end, insert }],
    selFrom: start,
    selTo: start + insert.length,
  }
}

/**
 * 行内包裹：选中内容已同名包裹则反向剥掉；空选区插入 placeholder（由 i18n 传入）并让它
 * 保持选中，好让用户直接接着打字覆盖。
 */
export function buildInlineMarkEdit(
  text: string,
  from: number,
  to: number,
  kind: InlineMarkKind,
  placeholder: string,
): SourceEdit {
  const mark = MARKS[kind]
  const selected = text.slice(from, to)
  const wrapped =
    selected.length >= mark.length * 2 && selected.startsWith(mark) && selected.endsWith(mark)

  if (wrapped) {
    const body = selected.slice(mark.length, selected.length - mark.length)
    return { changes: [{ from, to, insert: body }], selFrom: from, selTo: from + body.length }
  }

  const body = selected === '' ? placeholder : selected
  return {
    changes: [{ from, to, insert: `${mark}${body}${mark}` }],
    selFrom: from + mark.length,
    selTo: from + mark.length + body.length,
  }
}

/** 链接与图片：`[选中或占位文本](url)`，插入后把光标落在 url 位置 */
export function buildLinkEdit(
  text: string,
  from: number,
  to: number,
  url: string,
  image: boolean,
  placeholder: string,
): SourceEdit {
  const label = text.slice(from, to) || placeholder
  const insert = `${image ? '!' : ''}[${label}](${url})`
  const urlStart = from + (image ? 2 : 1) + label.length + 2
  return {
    changes: [{ from, to, insert }],
    selFrom: urlStart,
    selTo: urlStart + url.length,
  }
}

/**
 * 块级插入（代码围栏、表格、分隔线、mermaid、公式）：占用选区所在整行，并保证前后各留
 * 一个空行，使插入结果是一个独立块。
 */
export function buildBlockEdit(text: string, from: number, to: number, block: string): SourceEdit {
  const { start, end } = selectionLineRange(text, from, to)
  const blankBefore = start === 0 || (text[start - 1] === '\n' && text[start - 2] === '\n')
  const blankAfter = end === text.length || (text[end] === '\n' && text[end + 1] === '\n')
  const insert = `${blankBefore ? '' : '\n'}${block}${blankAfter ? '' : '\n'}`

  return {
    changes: [{ from: start, to: end, insert }],
    selFrom: start + (blankBefore ? 0 : 1),
    selTo: start + (blankBefore ? 0 : 1) + block.length,
  }
}

/** 表格骨架：表头用 columnLabel + 序号（label 由 i18n 传入，避免把中文写死在逻辑里） */
export function buildTable(columnLabel: string, columns: number, rows: number): string {
  const header = `| ${Array.from({ length: columns }, (_, i) => `${columnLabel} ${i + 1}`).join(' | ')} |`
  const divider = `| ${Array.from({ length: columns }, () => '---').join(' | ')} |`
  const body = Array.from(
    { length: rows },
    () => `| ${Array.from({ length: columns }, () => '').join(' | ')} |`,
  ).join('\n')
  return `${header}\n${divider}\n${body}`
}

const CJK_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu

/** 词数：CJK 按字计、拉丁按词计，混排文档下这才是有意义的口径 */
export function countWords(text: string): number {
  const cjk = (text.match(CJK_RE) ?? []).length
  const latin = (text.replace(CJK_RE, ' ').match(/[\p{L}\p{N}][\p{L}\p{N}'_.-]*/gu) ?? []).length
  return cjk + latin
}

export function countStats(text: string): TextStats {
  return {
    chars: [...text].length,
    words: countWords(text),
    lines: text === '' ? 0 : text.split(/\r\n|\r|\n/).length,
  }
}

/** 由正文推导标题：首个 ATX 标题 → 首个非空行 → 空串 */
export function deriveTitle(text: string): string {
  const heading = /^#{1,6}[ \t]+(.+?)[ \t#]*$/m.exec(text)?.[1]
  if (heading) {
    return heading.trim()
  }
  return (text.split(/\r?\n/).find((line) => line.trim() !== '') ?? '').trim().slice(0, 60)
}

/** 导出文件名：用户起的标题优先，其次正文首个标题，都要过文件名净化 */
export function exportFileName(title: string, content: string, extension: string): string {
  return `${sanitizeFileName(title || deriveTitle(content), 'document')}.${extension}`
}
