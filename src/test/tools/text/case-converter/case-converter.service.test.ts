import { describe, expect, it } from 'vitest'

import { toCaseAll } from '@/tools/text/case-converter/service'

describe('toCaseAll', () => {
  it('converts space-separated words', () => {
    expect(toCaseAll('hello world')).toEqual({
      camel: 'helloWorld',
      pascal: 'HelloWorld',
      snake: 'hello_world',
      constant: 'HELLO_WORLD',
      kebab: 'hello-world',
      train: 'Hello-World',
      title: 'Hello World',
      sentence: 'Hello world',
    })
  })

  it('splits camelCase and PascalCase input', () => {
    const results = toCaseAll('fooBar')
    expect(results.camel).toBe('fooBar')
    expect(results.snake).toBe('foo_bar')
    expect(results.kebab).toBe('foo-bar')
    expect(results.constant).toBe('FOO_BAR')
  })

  it('handles acronyms like XMLHttpRequest', () => {
    const results = toCaseAll('XMLHttpRequest')
    expect(results.camel).toBe('xmlHttpRequest')
    expect(results.pascal).toBe('XmlHttpRequest')
    expect(results.kebab).toBe('xml-http-request')
  })

  it('splits mixed separators (spaces, underscores, dashes)', () => {
    const results = toCaseAll('a  b --c__d')
    expect(results.camel).toBe('aBCD')
    expect(results.snake).toBe('a_b_c_d')
    expect(results.kebab).toBe('a-b-c-d')
  })

  it('keeps CJK words intact while converting latin parts', () => {
    const results = toCaseAll('中文 mixed_case test-String')
    expect(results.camel).toBe('中文MixedCaseTestString')
    expect(results.pascal).toBe('中文MixedCaseTestString')
    expect(results.snake).toBe('中文_mixed_case_test_string')
    expect(results.constant).toBe('中文_MIXED_CASE_TEST_STRING')
    expect(results.kebab).toBe('中文-mixed-case-test-string')
    expect(results.train).toBe('中文-Mixed-Case-Test-String')
    expect(results.title).toBe('中文 Mixed Case Test String')
    expect(results.sentence).toBe('中文 mixed case test string')
  })

  it('returns empty strings for empty input', () => {
    expect(toCaseAll('')).toEqual({
      camel: '',
      pascal: '',
      snake: '',
      constant: '',
      kebab: '',
      train: '',
      title: '',
      sentence: '',
    })
  })
})
