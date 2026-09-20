import { describe, expect, it } from 'vitest'

import {
  applyGrammarError,
  applyGrammarErrorToHtml,
  parseGrammarErrors,
  plainTextView,
  replacePlainText,
} from '@/tools/resume/ai/grammar'
import type { GrammarError } from '@/tools/resume/ai/grammar'

const error = (overrides: Partial<GrammarError> = {}): GrammarError => ({
  context: '负责电商交易中台订单履约链路的开发与维护',
  text: '做为',
  suggestion: '作为',
  reason: '错别字',
  type: 'spelling',
  ...overrides,
})

describe('plainTextView', () => {
  it('drops tags but keeps their order and records html offsets', () => {
    const html = '<p>ab<strong>cd</strong>ef</p>'
    const view = plainTextView(html)
    expect(view.text).toBe('abcdef')
    // 'e' 在原串里的位置
    expect(html.slice(view.starts[4], view.ends[4])).toBe('e')
  })

  it('collapses entities to a single character with the right span', () => {
    const html = 'a&amp;b'
    const view = plainTextView(html)
    expect(view.text).toBe('a&b')
    expect(html.slice(view.starts[1], view.ends[1])).toBe('&amp;')
  })

  it('handles numeric entities', () => {
    expect(plainTextView('&#20013;x').text).toBe('中x')
  })

  it('stops at an unterminated tag instead of looping forever', () => {
    expect(plainTextView('abc<div').text).toBe('abc')
  })
})

describe('replacePlainText', () => {
  it('replaces across an entity without corrupting the markup', () => {
    expect(replacePlainText('<p>a&amp;b</p>', 'a&b', 'xy')).toBe('<p>xy</p>')
  })

  it('never rewrites the inside of a tag', () => {
    // 'strong' 出现在标签名里，纯文本视图里没有，所以不该被改
    expect(replacePlainText('<strong>hi</strong>', 'strong', 'x')).toBeNull()
  })

  it('escapes the replacement so it cannot inject markup', () => {
    expect(replacePlainText('<p>hi</p>', 'hi', '<img onerror=1>')).toBe(
      '<p>&lt;img onerror=1&gt;</p>',
    )
  })

  it('returns null for an empty needle or a miss', () => {
    expect(replacePlainText('<p>hi</p>', '', 'x')).toBeNull()
    expect(replacePlainText('<p>hi</p>', 'nope', 'x')).toBeNull()
  })
})

describe('applyGrammarErrorToHtml', () => {
  it('prefers anchoring on the full sentence', () => {
    const html = '<p>做为负责人，做为下属</p>'
    const result = applyGrammarErrorToHtml(
      html,
      error({ context: '做为下属', text: '做为', suggestion: '作为' }),
    )
    expect(result).toBe('<p>做为负责人，作为下属</p>')
  })

  it('only falls back to a global replace above two characters', () => {
    const long = applyGrammarErrorToHtml(
      '<p>操作系统与算法设计</p>',
      error({ context: '', text: '操作系统', suggestion: '分布式系统' }),
    )
    expect(long).toBe('<p>分布式系统与算法设计</p>')
  })

  it('pins the inherited gate: a two-character word without context is not applied', () => {
    // 旧项目为防止误伤设的门槛。中文错别字大多是两字，所以 prompt 强制要求带 context
    expect(
      applyGrammarErrorToHtml(
        '<p>经里</p>',
        error({ context: '', text: '经里', suggestion: '经理' }),
      ),
    ).toBeNull()
    expect(
      applyGrammarErrorToHtml(
        '<p>他是经里</p>',
        error({ context: '他是经里', text: '经里', suggestion: '经理' }),
      ),
    ).toBe('<p>他是经理</p>')
  })

  it('repairs HTML that wraps the wrong word', () => {
    const html = '<p>他是<b>做为负责人</b></p>'
    const result = applyGrammarErrorToHtml(
      html,
      error({ context: '', text: '做为负责人', suggestion: '作为负责人' }),
    )
    expect(result).toBe('<p>他是<b>作为负责人</b></p>')
  })
})

describe('applyGrammarError', () => {
  const resume = {
    id: 'r1',
    basic: { name: '张三', photo: 'data:image/png;base64,做为' },
    experience: [
      { id: 'e1', company: '甲', details: '<p>做为负责人</p>' },
      { id: 'e2', company: '乙', details: '<p>做为下属</p>' },
    ],
  }

  it('fixes the first matching text field only', () => {
    const { data, applied } = applyGrammarError(
      resume,
      error({ context: '做为负责人', text: '做为', suggestion: '作为' }),
    )
    expect(applied).toBe(true)
    expect(data.experience[0].details).toBe('<p>作为负责人</p>')
    expect(data.experience[1].details).toBe('<p>做为下属</p>')
  })

  it('never rewrites ids or the base64 photo payload', () => {
    const { data } = applyGrammarError(
      resume,
      error({ context: '做为负责人', text: '做为', suggestion: '作为' }),
    )
    expect(data.basic.photo).toBe('data:image/png;base64,做为')
    expect(data.experience[0].id).toBe('e1')
  })

  it('reports failure when nothing matches', () => {
    const { data, applied } = applyGrammarError(
      resume,
      error({ context: '', text: '不存在', suggestion: 'x' }),
    )
    expect(applied).toBe(false)
    expect(data).toEqual(resume)
  })
})

describe('parseGrammarErrors', () => {
  it('reads a fenced JSON payload and normalizes the type', () => {
    const content =
      '```json\n{"errors":[{"context":"c","text":"做为","suggestion":"作为","reason":"错别字","type":"typo"}]}\n```'
    expect(parseGrammarErrors(content)).toEqual([
      { context: 'c', text: '做为', suggestion: '作为', reason: '错别字', type: 'spelling' },
    ])
  })

  it('keeps a known type and drops entries without text or suggestion', () => {
    const content = JSON.stringify({
      errors: [
        { context: '', text: 'aa', suggestion: 'bb', reason: '', type: 'punctuation' },
        { context: '', text: '', suggestion: 'bb', reason: '', type: 'grammar' },
        { context: '', text: 'cc', suggestion: '', reason: '', type: 'grammar' },
      ],
    })
    const parsed = parseGrammarErrors(content)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].type).toBe('punctuation')
  })

  it('returns nothing when the model produced no errors array', () => {
    expect(parseGrammarErrors('{"errors":[]}')).toEqual([])
    expect(parseGrammarErrors('{"result":"ok"}')).toEqual([])
  })
})
