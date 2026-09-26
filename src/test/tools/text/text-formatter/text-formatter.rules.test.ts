import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  applyRule,
  ruleGroups,
  rulesOfGroup,
  textRules,
  type TextRule,
} from '@/tools/text/text-formatter/text-formatter.rules'

/** 语言包按文件读入，避免把整份 JSON 打进测试产物 */
function localeBlock(locale: 'zh' | 'en'): {
  rules: Record<string, string>
  groups: Record<string, string>
} {
  const source = readFileSync(`src/modules/i18n/locales/${locale}/tools-text.json`, 'utf8')
  const parsed = JSON.parse(source) as {
    'text-formatter': { rules: Record<string, string>; groups: Record<string, string> }
  }
  return parsed['text-formatter']
}

const byId = new Map(textRules.map((rule) => [rule.id, rule]))

const run = (id: string, text: string): string => {
  const rule = byId.get(id)
  if (!rule) {
    throw new Error(`unknown rule ${id}`)
  }
  return rule.apply(text)
}

/** 每条规则一个代表性用例：输入 → 期望输出 */
const CASES: ReadonlyArray<readonly [id: string, input: string, expected: string]> = [
  ['sort-asc', 'b\na\nc', 'a\nb\nc'],
  ['sort-desc', 'b\na\nc', 'c\nb\na'],
  ['sort-length-asc', 'ccc\na\nbb', 'a\nbb\nccc'],
  ['sort-length-desc', 'a\nbb\nccc', 'ccc\nbb\na'],
  ['reverse-lines', '1\n2\n3', '3\n2\n1'],
  ['upper', 'abc 中文', 'ABC 中文'],
  ['lower', 'ABC DEF', 'abc def'],
  ['capitalize-words', 'hello world', 'Hello World'],
  ['capitalize-sentences', 'hello world. second one', 'Hello world. Second one'],
  ['swap-case', 'aBc', 'AbC'],
  ['to-camel', 'user name field', 'userNameField'],
  ['to-pascal', 'user name', 'UserName'],
  ['to-snake', 'userName', 'user_name'],
  ['to-constant', 'user name', 'USER_NAME'],
  ['to-kebab', 'userName', 'user-name'],
  ['to-train', 'user name', 'User-Name'],
  ['to-title', 'hello world', 'Hello World'],
  ['to-sentence', 'hello WORLD', 'Hello world'],
  ['extract-email', '联系 me@foo.cn 或 a.b@e.org!', 'me@foo.cn\na.b@e.org'],
  [
    'extract-url',
    '见 https://example.com/x?y=1 与 http://a.cn',
    'https://example.com/x?y=1\nhttp://a.cn',
  ],
  ['extract-number', 'a1 b-2.5 c', '1\n-2.5'],
  ['extract-cjk', 'hello 世界 foo 中文', '世界\n中文'],
  ['extract-latin', '提取 english 单词 words', 'english\nwords'],
  ['extract-ip', '192.168.1.1 和 999.1.1.1', '192.168.1.1'],
  ['comma-to-line', 'a, b，c', 'a\nb\nc'],
  ['semicolon-to-line', 'a;b；c', 'a\nb\nc'],
  ['period-to-line', 'one. two。three', 'one\ntwo\nthree'],
  ['amp-to-line', 'a&b&&c', 'a\nb\nc'],
  ['space-to-line', 'a b\tc', 'a\nb\nc'],
  ['pipe-to-line', 'a|b||c', 'a\nb\nc'],
  ['ideographic-comma-to-line', '甲、乙、丙', '甲\n乙\n丙'],
  ['line-to-comma', 'a\nb\nc', 'a,b,c'],
  ['line-to-semicolon', 'a\nb\nc', 'a;b;c'],
  ['line-to-period', 'a\nb\nc', 'a。b。c'],
  ['line-to-amp', 'a\nb\nc', 'a&b&c'],
  ['line-to-space', 'a\nb\nc', 'a b c'],
  ['line-to-pipe', 'a\nb\nc', 'a|b|c'],
  ['line-to-ideographic-comma', 'a\nb\nc', 'a、b、c'],
  ['merge-lines', 'a\nb\nc', 'abc'],
  ['wrap-double-quote', 'a\nb', '"a"\n"b"'],
  ['wrap-single-quote', 'a', "'a'"],
  ['sql-list', 'a\nb', "'a','b'"],
  ['add-line-numbers', 'a\nbb', '1\ta\n2\tbb'],
  ['escape-html', '<a href="x">&', '&lt;a href=&quot;x&quot;&gt;&amp;'],
  ['unescape-html', '&lt;&#39;&nbsp;&copy;', "<'\u00a0©"],
  ['escape-java', '中"a', '\\u4e2d\\"a'],
  ['unescape-java', '\\u4e2d\\n', '中\n'],
  ['remove-spaces', 'a b\tc', 'abc'],
  ['trim-lines', '  a  \n b', 'a\nb'],
  ['collapse-spaces', 'a   b', 'a b'],
  ['remove-empty-lines', 'a\n\nb', 'a\nb'],
  ['remove-duplicate-lines', 'a\nb\na', 'a\nb'],
  ['remove-punctuation', 'a,b!中。', 'ab中'],
  ['remove-special-chars', 'a#b 中', 'ab 中'],
  ['remove-digits', 'a1b2', 'ab'],
  ['remove-html-tags', '<p>a</p>', 'a'],
  ['remove-comment-lines', 'a\n# b\n// c\n-- d\ne', 'a\ne'],
  ['remove-invisible-chars', 'plain​text', 'plaintext'],
  ['fullwidth-to-half', 'Ａ１（', 'A1('],
  ['tab-to-spaces', 'a\tb', 'a    b'],
  ['normalize-newlines', 'a\r\nb\rc', 'a\nb\nc'],
  ['markdown-to-text', '# Title\n\nSome **bold** text', 'Title\n\nSome bold text'],
  ['html-to-text', '<p>Hello</p><p>World</p>', 'Hello\nWorld'],
]

describe('text rules', () => {
  it('registers 64 unique rules', () => {
    expect(textRules).toHaveLength(64)
    expect(byId.size).toBe(64)
  })

  it('covers every declared group', () => {
    for (const group of ruleGroups) {
      expect(rulesOfGroup(group).length).toBeGreaterThan(0)
    }
    expect(ruleGroups.reduce((sum, group) => sum + rulesOfGroup(group).length, 0)).toBe(
      textRules.length,
    )
  })

  it('has a representative case for every rule', () => {
    const covered = new Set(CASES.map(([id]) => id))
    // shuffle-lines 输出随机，由下方专用用例覆盖
    expect(textRules.filter((rule) => !covered.has(rule.id)).map((rule) => rule.id)).toEqual([
      'shuffle-lines',
    ])
    for (const [id] of CASES) {
      expect(byId.has(id), id).toBe(true)
    }
  })

  for (const [id, input, expected] of CASES) {
    it(`${id}: transforms sample input`, () => {
      expect(run(id, input)).toBe(expected)
    })
  }

  it('returns empty text for empty input on every rule', () => {
    for (const rule of textRules) {
      expect(applyRule(rule, ''), rule.id).toEqual({ ok: true, value: '' })
    }
  })

  it('never throws on awkward input', () => {
    const samples = ['   \n\t \n', '!!! ??? 。。，', '😀😀😀\nabc', 'a\r\nb']
    for (const rule of textRules) {
      for (const input of samples) {
        const outcome = applyRule(rule, input)
        expect(outcome.ok, `${rule.id} over ${JSON.stringify(input)}`).toBe(true)
        if (outcome.ok) {
          expect(typeof outcome.value).toBe('string')
        }
      }
    }
  })

  it('shuffles lines without adding or dropping any', () => {
    const input = ['a', 'b', 'c', 'd', 'e', 'f'].join('\n')
    expect(run('shuffle-lines', input).split('\n').sort()).toEqual(input.split('\n').sort())
  })

  it('sorts digits naturally inside text', () => {
    expect(run('sort-asc', 'item10\nitem2\nitem1')).toBe('item1\nitem2\nitem10')
  })

  it('treats a lone high surrogate escape as one code unit', () => {
    expect(run('unescape-java', '\\uD83D\\uDE00')).toBe('😀')
  })

  it('leaves unknown escapes and malformed entities untouched', () => {
    expect(run('unescape-java', 'a\\qb')).toBe('a\\qb')
    expect(run('unescape-html', '&notanentity; &#9999999;')).toBe('&notanentity; &#9999999;')
  })

  it('leaves invisible characters out but keeps newlines', () => {
    expect(run('remove-invisible-chars', 'a\u200Bb\uFEFFc')).toBe('abc')
  })

  it('reports a failure instead of throwing', () => {
    const broken: TextRule = {
      id: 'broken',
      group: 'clean',
      apply: () => {
        throw new Error('boom')
      },
    }
    expect(applyRule(broken, 'x')).toEqual({ ok: false, message: 'boom' })
  })
})

describe('text rule translations', () => {
  for (const locale of ['zh', 'en'] as const) {
    it(`${locale}: labels every rule and group`, () => {
      const block = localeBlock(locale)
      for (const rule of textRules) {
        expect(block.rules[rule.id], `${locale} rule ${rule.id}`).toBeTruthy()
      }
      for (const group of ruleGroups) {
        expect(block.groups[group], `${locale} group ${group}`).toBeTruthy()
      }
    })
  }
})
