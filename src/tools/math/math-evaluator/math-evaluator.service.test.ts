import { describe, expect, it } from 'vitest'

import { evaluateMath } from './math-evaluator.service'

describe('evaluateMath', () => {
  it('evaluates arithmetic with correct precedence', () => {
    expect(evaluateMath('2 + 3 * 4')).toBe('14')
    expect(evaluateMath('(2 + 3) * 4')).toBe('20')
    expect(evaluateMath('2 ^ 10')).toBe('1024')
    expect(evaluateMath('10 / 4')).toBe('2.5')
  })

  it('evaluates mathjs functions', () => {
    expect(evaluateMath('sqrt(16)')).toBe('4')
    expect(evaluateMath('sin(pi / 2)')).toBe('1')
    expect(evaluateMath('log(1000, 10)')).toBe('3')
  })

  it('supports constants pi and e', () => {
    expect(evaluateMath('pi > 3.14')).toBe('true')
    expect(evaluateMath('e')).toBe('2.718281828459')
  })

  it('supports variable assignment across multiple lines', () => {
    expect(evaluateMath('x = 2\nx + 1')).toBe('3')
    expect(evaluateMath('a = 2\nb = 3\na * b')).toBe('6')
  })

  it('returns the last expression result for multi-line input', () => {
    expect(evaluateMath('1 + 1\n2 * 2')).toBe('4')
  })

  it('formats floating point tails away', () => {
    expect(evaluateMath('0.1 + 0.2')).toBe('0.3')
  })

  it('renders units, complex numbers and matrices readably', () => {
    expect(evaluateMath('5 km to m')).toBe('5000 m')
    expect(evaluateMath('sqrt(-4)')).toBe('2i')
    expect(evaluateMath('[1, 2, 3]')).toBe('[1, 2, 3]')
  })

  it('renders object results as JSON', () => {
    expect(evaluateMath('{a: 1}')).toBe('{"a":1}')
  })

  it('returns empty string for empty input', () => {
    expect(evaluateMath('')).toBe('')
    expect(evaluateMath('   \n  ')).toBe('')
  })

  it('throws on syntax errors and unknown symbols', () => {
    expect(() => evaluateMath('1 +')).toThrow(Error)
    expect(() => evaluateMath(')')).toThrow(Error)
    expect(() => evaluateMath('unknownsymbolxyz')).toThrow(Error)
    expect(() => evaluateMath('foo(1)')).toThrow(Error)
  })
})
