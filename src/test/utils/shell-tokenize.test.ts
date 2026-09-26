import { describe, expect, it } from 'vitest'

import { ShellSyntaxError, splitShellCommands } from '@/utils/shell-tokenize'

const first = (source: string): string[] => splitShellCommands(source)[0] ?? []

describe('splitShellCommands', () => {
  it('splits a bare command on whitespace', () => {
    expect(first('curl https://x.com/a')).toEqual(['curl', 'https://x.com/a'])
    expect(first('curl\t-a\t-b')).toEqual(['curl', '-a', '-b'])
  })

  it('returns nothing for empty or whitespace-only input', () => {
    expect(splitShellCommands('')).toEqual([])
    expect(splitShellCommands('   \n  \t\n')).toEqual([])
    expect(splitShellCommands('# only a comment')).toEqual([])
  })

  it('keeps single and double quoted words verbatim', () => {
    expect(first(`curl -H 'A: b' -H "C: d"`)).toEqual(['curl', '-H', 'A: b', '-H', 'C: d'])
  })

  it('preserves an explicitly empty word', () => {
    expect(first("curl -d ''")).toEqual(['curl', '-d', ''])
  })

  it('concatenates adjacent quoted and unquoted fragments into one word', () => {
    expect(first(`curl --data-raw $'{"a":1}'`)).toEqual(['curl', '--data-raw', '{"a":1}'])
    expect(first(`curl -d a'b'c`)).toEqual(['curl', '-d', 'abc'])
    expect(first(`curl -d 'x'"y"$'z'`)).toEqual(['curl', '-d', 'xyz'])
  })

  it('unescapes backslashes inside double quotes only for $ ` " \\', () => {
    expect(first('curl -d "a\\"b"')).toEqual(['curl', '-d', 'a"b'])
    expect(first('curl -d "a\\\\b"')).toEqual(['curl', '-d', 'a\\b'])
    expect(first('curl -d "a\\nb"')).toEqual(['curl', '-d', 'a\\nb'])
    expect(first('curl -d "a\\$b"')).toEqual(['curl', '-d', 'a$b'])
  })

  it('treats a backslash before other characters as a literal escape', () => {
    expect(first('curl -d a\\ b')).toEqual(['curl', '-d', 'a b'])
    expect(first('curl -d a\\,b')).toEqual(['curl', '-d', 'a,b'])
  })

  it('joins physical lines that end with a backslash continuation', () => {
    expect(first("curl 'https://x.com' \\\n  -H 'A: b' \\\n  -d '{\"a\":1}'")).toEqual([
      'curl',
      'https://x.com',
      '-H',
      'A: b',
      '-d',
      '{"a":1}',
    ])
    expect(first('curl -a \\\r\n-b')).toEqual(['curl', '-a', '-b'])
  })

  it('does not break the command on a continuation inside a word', () => {
    expect(first('curl -d ab\\\ncd')).toEqual(['curl', '-d', 'abcd'])
  })

  it('decodes ANSI-C escapes used by Chrome DevTools', () => {
    expect(first(`curl --data-raw $'line1\nline2'`)).toEqual(['curl', '--data-raw', 'line1\nline2'])
    expect(first(`curl -d $'a\\tb'`)).toEqual(['curl', '-d', 'a\tb'])
    expect(first(`curl -d $'\\x41\\102'`)).toEqual(['curl', '-d', 'AB'])
    expect(first(`curl -d $'\\42'`)).toEqual(['curl', '-d', '"'])
    expect(first(`curl -d $'\\u4e2d'`)).toEqual(['curl', '-d', '中'])
    expect(first(`curl -d $'it\\'s'`)).toEqual(['curl', '-d', "it's"])
    expect(first(`curl -d $'\\\\d'`)).toEqual(['curl', '-d', '\\d'])
  })

  it('drops comments from the end of a line', () => {
    expect(first('curl -a # trailing note\n-b')).toEqual(['curl', '-a'])
  })

  it('splits chained commands on newlines and shell operators', () => {
    expect(splitShellCommands('curl -a\ncurl -b')).toEqual([
      ['curl', '-a'],
      ['curl', '-b'],
    ])
    expect(splitShellCommands('curl -a && curl -b')).toEqual([
      ['curl', '-a'],
      ['curl', '-b'],
    ])
    expect(splitShellCommands('curl -a ; curl -b || curl -c')).toHaveLength(3)
    expect(splitShellCommands('echo x | curl -a')).toEqual([
      ['echo', 'x'],
      ['curl', '-a'],
    ])
  })

  it('drops redirection targets and the file descriptor prefix', () => {
    expect(splitShellCommands('curl https://x.com -o f 2> err.log')).toEqual([
      ['curl', 'https://x.com', '-o', 'f'],
      ['err.log'],
    ])
    expect(first('curl https://x.com 2> err.log')).toEqual(['curl', 'https://x.com'])
  })

  it('keeps URL globbing braces and brackets as ordinary characters', () => {
    expect(first('curl -g https://x.com/{a,b}[1]')).toEqual([
      'curl',
      '-g',
      'https://x.com/{a,b}[1]',
    ])
  })

  it('reports an unterminated quote with a 1-based position', () => {
    expect(() => splitShellCommands(`curl -d 'abc`)).toThrow(ShellSyntaxError)
    try {
      splitShellCommands("curl -a\n  -d 'abc")
      expect.unreachable('expected a syntax error')
    } catch (error) {
      expect(error).toBeInstanceOf(ShellSyntaxError)
      const syntaxError = error as ShellSyntaxError
      expect(syntaxError.code).toBe('unterminatedQuote')
      expect(syntaxError.line).toBe(2)
      expect(syntaxError.column).toBe(6)
    }
  })

  it('reports an unterminated double quote', () => {
    expect(() => splitShellCommands('curl -d "abc')).toThrow(/unterminated double-quoted/)
  })

  it('rejects command substitution, locale strings and here-documents', () => {
    expect(() => splitShellCommands('curl -d $(whoami)')).toThrow(/command substitution/)
    expect(() => splitShellCommands('curl -d `whoami`')).toThrow(/command substitution/)
    expect(() => splitShellCommands('curl -d "a$(whoami)b"')).toThrow(/command substitution/)
    expect(() => splitShellCommands('curl -d $"locale"')).toThrow(/command substitution/)
    expect(() => splitShellCommands('curl -d <<EOF')).toThrow(/here-document/)
  })

  it('parses a Chrome DevTools command end to end', () => {
    expect(
      first(
        `curl 'https://api.x/v1/items?page=2' \\\n` +
          `  -H 'sec-ch-ua: "Chromium";v="126"' \\\n` +
          `  -H 'content-type: application/json' \\\n` +
          `  --data-raw $'{"note":"a\\nb"}' \\\n` +
          `  --compressed`,
      ),
    ).toEqual([
      'curl',
      'https://api.x/v1/items?page=2',
      '-H',
      'sec-ch-ua: "Chromium";v="126"',
      '-H',
      'content-type: application/json',
      '--data-raw',
      '{"note":"a\nb"}',
      '--compressed',
    ])
  })
})
