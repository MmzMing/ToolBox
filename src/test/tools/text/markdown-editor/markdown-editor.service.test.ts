import { describe, expect, it } from 'vitest'

import {
  buildBlockEdit,
  buildInlineMarkEdit,
  buildLineBlockEdit,
  buildLinkEdit,
  buildTable,
  countStats,
  countWords,
  deriveTitle,
  exportFileName,
  selectionLineRange,
} from '@/tools/text/markdown-editor/markdown-editor.service'

describe('inline mark edit', () => {
  it('wraps the selection and keeps the markers outside the selection', () => {
    const edit = buildInlineMarkEdit('hello', 0, 5, 'bold', '占位')
    expect(edit.changes).toEqual([{ from: 0, to: 5, insert: '**hello**' }])
    expect(edit.selFrom).toBe(2)
    expect(edit.selTo).toBe(7)
  })

  it('unwraps already wrapped selection', () => {
    const edit = buildInlineMarkEdit('**hi**', 0, 6, 'bold', '占位')
    expect(edit.changes).toEqual([{ from: 0, to: 6, insert: 'hi' }])
    expect(edit.selTo).toBe(2)
  })

  it('inserts the placeholder on an empty selection and selects it', () => {
    const edit = buildInlineMarkEdit('', 0, 0, 'bold', '粗体文本')
    expect(edit.changes[0].insert).toBe('**粗体文本**')
    expect(edit.selFrom).toBe(2)
    expect(edit.selTo).toBe(2 + '粗体文本'.length)
  })

  it('treats the math mark as a single dollar sign', () => {
    const edit = buildInlineMarkEdit('E=mc^2', 0, 6, 'math', 'x')
    expect(edit.changes[0].insert).toBe('$E=mc^2$')
  })
})

describe('line block edit', () => {
  it('prefixes the lines the selection touches', () => {
    const edit = buildLineBlockEdit('one\ntwo', 0, 3, 'heading1')
    expect(edit.changes).toEqual([{ from: 0, to: 3, insert: '# one' }])
  })

  it('removes the prefix when every touched line already has it', () => {
    const edit = buildLineBlockEdit('# one\n# two', 0, 11, 'heading1')
    expect(edit.changes[0].insert).toBe('one\ntwo')
  })

  it('renumbers an ordered list by position', () => {
    const edit = buildLineBlockEdit('a\nb\nc', 0, 5, 'ordered')
    expect(edit.changes[0].insert).toBe('1. a\n2. b\n3. c')
  })

  it('replaces a foreign line marker instead of stacking', () => {
    const edit = buildLineBlockEdit('- item', 0, 6, 'quote')
    expect(edit.changes[0].insert).toBe('> item')
  })

  it('strips an existing task marker when converting to a bullet', () => {
    const edit = buildLineBlockEdit('- [x] done', 0, 10, 'unordered')
    expect(edit.changes[0].insert).toBe('- done')
  })

  it('leaves blank lines untouched inside the range', () => {
    const edit = buildLineBlockEdit('a\n\nb', 0, 4, 'unordered')
    expect(edit.changes[0].insert).toBe('- a\n\n- b')
  })
})

describe('selection line range', () => {
  it('expands a caret to its whole line', () => {
    expect(selectionLineRange('ab\ncd', 3, 3)).toEqual({ start: 3, end: 5 })
  })

  it('clamps to document bounds', () => {
    expect(selectionLineRange('ab', 0, 2)).toEqual({ start: 0, end: 2 })
  })
})

describe('link edit', () => {
  it('uses the selection as the label and drops the caret in the url slot', () => {
    const edit = buildLinkEdit('text', 0, 4, '', false, '链接文本')
    expect(edit.changes[0].insert).toBe('[text]()')
    // [text](|) —— 光标落在括号内的 url 位置
    expect(edit.selFrom).toBe(7)
    expect(edit.selTo).toBe(7)
  })

  it('falls back to the placeholder when nothing is selected', () => {
    const edit = buildLinkEdit('', 0, 0, 'https://a.dev', true, 'alt')
    expect(edit.changes[0].insert).toBe('![alt](https://a.dev)')
    expect(edit.selFrom).toBe(7)
    expect(edit.selTo).toBe(7 + 'https://a.dev'.length)
  })
})

describe('block edit', () => {
  it('pads the block with a blank line when the previous line is not blank', () => {
    const edit = buildBlockEdit('a\nb', 2, 2, '---')
    expect(edit.changes[0].insert).toBe('\n---')
  })

  it('adds no padding at the very start of the document', () => {
    const edit = buildBlockEdit('abc', 0, 3, '---')
    expect(edit.changes[0].insert).toBe('---')
  })
})

describe('table skeleton', () => {
  it('builds header, divider and body rows', () => {
    expect(buildTable('列', 2, 1)).toBe('| 列 1 | 列 2 |\n| --- | --- |\n|  |  |')
  })
})

describe('text statistics', () => {
  it('counts CJK per character and latin per word', () => {
    expect(countWords('中 a b')).toBe(3)
  })

  it('returns zeros for empty input', () => {
    expect(countStats('')).toEqual({ chars: 0, words: 0, lines: 0 })
  })

  it('counts code points rather than utf-16 units', () => {
    expect(countStats('😀😀').chars).toBe(2)
  })

  it('splits CRLF lines', () => {
    expect(countStats('a\r\nb').lines).toBe(2)
  })
})

describe('title derivation', () => {
  it('prefers the first ATX heading', () => {
    expect(deriveTitle('text\n\n# Real Title')).toBe('Real Title')
  })

  it('falls back to the first non-empty line', () => {
    expect(deriveTitle('\n  hello  ')).toBe('hello')
  })

  it('returns empty string for blank input', () => {
    expect(deriveTitle('')).toBe('')
  })
})

describe('export file name', () => {
  it('prefers the user title and sanitises path separators', () => {
    expect(exportFileName('a/b', '# ignored', 'md')).toBe('a b.md')
  })

  it('falls back to the derived heading', () => {
    expect(exportFileName('', '# Doc One\n\nbody', 'html')).toBe('Doc One.html')
  })

  it('falls back to a fixed word when there is nothing to name it after', () => {
    expect(exportFileName('', '   ', 'md')).toBe('document.md')
  })
})
