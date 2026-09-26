import { describe, expect, it } from 'vitest'

import {
  DIALECT_SPECS,
  joinArguments,
  quoteFor,
} from '@/tools/development/curl-generator/dialect-escape'

const { bash, cmd, powershell } = DIALECT_SPECS

describe('quoteFor', () => {
  it('wraps bash values in single quotes', () => {
    expect(quoteFor(bash, 'https://x.com/a?b=1&c=2')).toEqual("'https://x.com/a?b=1&c=2'")
    expect(quoteFor(bash, '')).toEqual("''")
  })

  it('escapes a single quote in bash by closing and reopening the quote', () => {
    expect(quoteFor(bash, "it's")).toEqual(`'it'\\''s'`)
  })

  it('switches to ANSI-C quoting when the value holds control characters', () => {
    expect(quoteFor(bash, 'a\nb')).toEqual(`$'a\\nb'`)
    expect(quoteFor(bash, 'a\tb')).toEqual(`$'a\\tb'`)
    expect(quoteFor(bash, "a'\nb")).toEqual(`$'a\\'\\nb'`)
  })

  it('escapes double quotes and backslashes for cmd', () => {
    expect(quoteFor(cmd, 'a"b')).toEqual('"a\\"b"')
    expect(quoteFor(cmd, 'a\\b')).toEqual('"a\\\\b"')
    expect(quoteFor(cmd, '100%')).toEqual('"100%"')
  })

  it('folds newlines for cmd because they cannot survive a caret continuation', () => {
    expect(quoteFor(cmd, 'a\nb')).toEqual('"a b"')
    expect(quoteFor(cmd, 'a\r\nb')).toEqual('"a b"')
  })

  it('doubles single quotes for PowerShell', () => {
    expect(quoteFor(powershell, "it's")).toEqual("'it''s'")
    expect(quoteFor(powershell, 'a\nb')).toEqual("'a\nb'")
  })
})

describe('DIALECT_SPECS', () => {
  it('calls curl.exe under PowerShell to dodge the Invoke-WebRequest alias', () => {
    expect(powershell.executable).toBe('curl.exe')
    expect(bash.executable).toBe('curl')
    expect(cmd.executable).toBe('curl')
  })
})

describe('joinArguments', () => {
  it('joins on one line when multiline is off', () => {
    expect(joinArguments(['curl', '-a'], bash, false)).toBe('curl -a')
  })

  it('uses the dialect continuation marker with a two-space indent', () => {
    expect(joinArguments(['curl', '-a', '-b'], bash, true)).toBe('curl \\\n  -a \\\n  -b')
    expect(joinArguments(['curl.exe', '-a'], powershell, true)).toBe('curl.exe `\n  -a')
    expect(joinArguments(['curl', '-a'], cmd, true)).toBe('curl ^\n  -a')
  })

  it('never leaves trailing whitespace after a continuation marker', () => {
    for (const spec of [bash, cmd, powershell]) {
      const [firstLine] = joinArguments(['curl', '-a'], spec, true).split('\n')
      expect(firstLine).toBe(`curl ${spec.continuation}`)
    }
  })
})
