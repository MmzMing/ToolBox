import { describe, expect, it } from 'vitest'

import { canStripComments, stripComments } from '@/utils/code-comments'

describe('canStripComments', () => {
  it('is true for formats that have a comment syntax', () => {
    for (const format of ['json', 'yaml', 'toml', 'xml', 'html', 'markdown', 'sql'] as const) {
      expect(canStripComments(format)).toBe(true)
    }
  })

  it('is false for csv, which has no comment syntax', () => {
    expect(canStripComments('csv')).toBe(false)
  })
})

describe('stripComments - json', () => {
  it('drops line and block comments, including the lines they occupied', () => {
    const input = '{\n  // 说明\n  "a": 1, /* 行内 */\n  "b": 2\n}'
    const output = stripComments(input, 'json')
    expect(output).toBe('{\n  "a": 1, \n  "b": 2\n}')
    expect(JSON.parse(output)).toEqual({ a: 1, b: 2 })
  })

  it('leaves comment markers inside strings alone', () => {
    for (const input of [
      '{"url":"https://example.com/a"}',
      '{"a":"// not a comment"}',
      '{"a":"/* also not */"}',
      '{"a":"quote \\" then // text"}',
    ]) {
      expect(stripComments(input, 'json')).toBe(input)
    }
  })

  it('is idempotent and returns the input unchanged when there is nothing to strip', () => {
    const input = '{"a":1}'
    expect(stripComments(input, 'json')).toBe(input)
    const cleaned = stripComments('{"a":1} // c\n', 'json')
    expect(stripComments(cleaned, 'json')).toBe(cleaned)
  })

  it('returns an empty string for empty input without throwing', () => {
    expect(stripComments('', 'json')).toBe('')
  })
})

describe('stripComments - yaml / toml', () => {
  it('strips hash comments and the lines they occupied', () => {
    expect(stripComments('# 顶部说明\nname: ToolBox # 尾注', 'yaml')).toBe('name: ToolBox ')
    expect(stripComments('# c\nname = "ToolBox"', 'toml')).toBe('name = "ToolBox"')
  })

  it('only treats # as a comment start after a boundary', () => {
    expect(stripComments('url: http://x#y', 'yaml')).toBe('url: http://x#y')
    expect(stripComments('key: "# 不是注释"', 'yaml')).toBe('key: "# 不是注释"')
  })

  it('handles yaml doubled-quote escapes', () => {
    expect(stripComments("key: 'it''s # fine'", 'yaml')).toBe("key: 'it''s # fine'")
  })
})

describe('stripComments - xml / html / markdown', () => {
  it('strips markup comments and the lines they occupied', () => {
    expect(stripComments('<root>\n  <!-- 说明 -->\n  <a>1</a>\n</root>', 'xml')).toBe(
      '<root>\n  <a>1</a>\n</root>',
    )
    expect(stripComments('<!-- 说明 -->\n# 标题', 'markdown')).toBe('# 标题')
  })

  it('keeps comments that sit inside attribute values', () => {
    const input = '<root a="<!-- x -->"/>'
    expect(stripComments(input, 'xml')).toBe(input)
  })

  it('keeps comment-looking text inside markdown code spans', () => {
    const input = 'use `<!-- x -->` here'
    expect(stripComments(input, 'markdown')).toBe(input)
  })

  it('keeps inline markup comments on the same line as content', () => {
    expect(stripComments('<p>a</p><!-- 说明 -->', 'html')).toBe('<p>a</p>')
  })
})

describe('stripComments - sql', () => {
  it('strips line and block comments', () => {
    expect(stripComments('select 1 -- 说明\n-- 整行\nfrom t', 'sql')).toBe('select 1 \nfrom t')
    expect(stripComments('/* 头部 */ select 1', 'sql')).toBe(' select 1')
  })

  it('leaves comment markers inside string literals alone', () => {
    const input = 'select \'--x\', "/*y*/" from t'
    expect(stripComments(input, 'sql')).toBe(input)
  })
})

describe('stripComments - csv', () => {
  it('returns the input unchanged', () => {
    const input = '# not a comment,a\n1,2'
    expect(stripComments(input, 'csv')).toBe(input)
  })
})
