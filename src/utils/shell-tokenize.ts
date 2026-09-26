export type ShellSyntaxCode = 'unterminatedQuote' | 'unsupportedSyntax'

/** shell 语法无法解析；`line` / `column` 从 1 开始，供 UI 定位提示 */
export class ShellSyntaxError extends Error {
  readonly code: ShellSyntaxCode
  readonly line: number
  readonly column: number

  constructor(code: ShellSyntaxCode, message: string, line: number, column: number) {
    super(message)
    this.name = 'ShellSyntaxError'
    this.code = code
    this.line = line
    this.column = column
  }
}

/**
 * 解开引号与转义，并按命令分隔符（换行、`;` `&&` `||` `|` 重定向）切成若干 argv。
 * 括号与花括号按普通字符保留——curl 开了 `-g` 时 URL 里就可能出现它们。
 */
export function splitShellCommands(source: string): string[][] {
  const commands: string[][] = []
  let argv: string[] = []
  let word = ''
  let hasWord = false

  const fail = (code: ShellSyntaxCode, message: string, at: number): never => {
    const { line, column } = locate(source, at)
    throw new ShellSyntaxError(code, message, line, column)
  }

  const flush = () => {
    if (hasWord) {
      argv.push(word)
      word = ''
      hasWord = false
    }
  }
  const breakCommand = () => {
    flush()
    if (argv.length > 0) {
      commands.push(argv)
      argv = []
    }
  }

  let i = 0
  while (i < source.length) {
    const ch = source[i]

    if (ch === '\n' || ch === '\r') {
      breakCommand()
      i += ch === '\r' && source[i + 1] === '\n' ? 2 : 1
      continue
    }
    if (ch === ' ' || ch === '\t') {
      flush()
      i += 1
      continue
    }
    if (ch === '#' && !hasWord) {
      while (i < source.length && source[i] !== '\n') i += 1
      continue
    }
    if (ch === '\\' && (source[i + 1] === '\n' || source[i + 1] === '\r')) {
      i += source[i + 1] === '\r' && source[i + 2] === '\n' ? 3 : 2
      continue
    }
    if (ch === '\\' && i + 1 < source.length) {
      word += source[i + 1]
      hasWord = true
      i += 2
      continue
    }
    if (ch === "'") {
      const end = source.indexOf("'", i + 1)
      if (end < 0) fail('unterminatedQuote', 'unterminated single-quoted string', i)
      word += source.slice(i + 1, end)
      hasWord = true
      i = end + 1
      continue
    }
    if (ch === '"') {
      const [text, next] = readDoubleQuoted(source, i, fail)
      word += text
      hasWord = true
      i = next
      continue
    }
    if (ch === '$' && source[i + 1] === "'") {
      const [text, next] = readAnsiCQuoted(source, i, fail)
      word += text
      hasWord = true
      i = next
      continue
    }
    if (ch === '`' || (ch === '$' && (source[i + 1] === '"' || source[i + 1] === '('))) {
      const what = ch === '`' ? '`' : `$${source[i + 1]}`
      fail(
        'unsupportedSyntax',
        `unsupported shell syntax ${JSON.stringify(what)}: command substitution and locale strings are not parsed`,
        i,
      )
    }
    if (ch === '<' && source[i + 1] === '<') {
      fail('unsupportedSyntax', 'unsupported shell syntax: here-document is not parsed', i)
    }
    if (ch === '&' || ch === ';' || ch === '|' || ch === '<' || ch === '>') {
      const double = source[i + 1] === ch
      flush()
      if (ch === '>') {
        // 丢弃 `2>` 这类文件描述符前缀，不让它混进参数列表
        const last = argv[argv.length - 1]
        if (last !== undefined && /^\d+$/.test(last)) argv.pop()
      }
      breakCommand()
      i += double ? 2 : 1
      while (i < source.length && (source[i] === ' ' || source[i] === '\t')) i += 1
      continue
    }

    word += ch
    hasWord = true
    i += 1
  }

  breakCommand()
  return commands
}

function readDoubleQuoted(
  source: string,
  start: number,
  fail: (code: ShellSyntaxCode, message: string, at: number) => never,
): [string, number] {
  let out = ''
  let i = start + 1
  while (i < source.length) {
    const ch = source[i]
    if (ch === '"') return [out, i + 1]
    if (ch === '\\') {
      const next = source[i + 1]
      if (next === '\n' || next === '\r') {
        i += next === '\r' && source[i + 2] === '\n' ? 3 : 2
        continue
      }
      if (next === '"' || next === '\\' || next === '$' || next === '`') {
        out += next
        i += 2
        continue
      }
      out += ch
      i += 1
      continue
    }
    if (ch === '`' || (ch === '$' && source[i + 1] === '(')) {
      fail('unsupportedSyntax', 'command substitution inside double quotes is not parsed', i)
    }
    out += ch
    i += 1
  }
  return fail('unterminatedQuote', 'unterminated double-quoted string', start)
}

const ANSI_C_ESCAPES: Record<string, string> = {
  a: '\u0007',
  b: '\b',
  e: '\u001b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
  v: '\v',
  '\\': '\\',
  '"': '"',
  "'": "'",
  '?': '?',
}

/** `$'...'` ANSI-C 引用：Chrome DevTools 对含换行或控制字符的 body 就输出这种形式 */
function readAnsiCQuoted(
  source: string,
  start: number,
  fail: (code: ShellSyntaxCode, message: string, at: number) => never,
): [string, number] {
  let out = ''
  let i = start + 2
  while (i < source.length) {
    const ch = source[i]
    if (ch === "'") return [out, i + 1]
    if (ch !== '\\') {
      out += ch
      i += 1
      continue
    }
    const esc = source[i + 1]
    if (esc === undefined) break
    if (esc === '\n' || esc === '\r') {
      i += esc === '\r' && source[i + 2] === '\n' ? 3 : 2
      continue
    }
    if (esc === 'x' || esc === 'u' || esc === 'U') {
      const hex = readRun(source, i + 2, /^[0-9a-fA-F]$/)
      if (hex.length > 0) {
        out += safeCodePoint(Number.parseInt(hex, 16))
        i += 2 + hex.length
        continue
      }
    }
    if (/[0-7]/.test(esc)) {
      const oct = readRun(source, i + 1, /^[0-7]$/)
      out += safeCodePoint(Number.parseInt(oct.slice(0, 3), 8))
      i += 1 + Math.min(oct.length, 3)
      continue
    }
    out += esc in ANSI_C_ESCAPES ? ANSI_C_ESCAPES[esc] : esc
    i += 2
  }
  return fail('unterminatedQuote', "unterminated $'...' string", start)
}

function safeCodePoint(value: number): string {
  return value >= 0 && value <= 0x10ffff ? String.fromCodePoint(value) : ''
}

function readRun(source: string, from: number, digit: RegExp): string {
  let out = ''
  while (from + out.length < source.length && digit.test(source[from + out.length])) {
    out += source[from + out.length]
  }
  return out
}

function locate(source: string, index: number): { line: number; column: number } {
  let line = 1
  let lineStart = 0
  for (let i = 0; i < index; i += 1) {
    if (source[i] === '\n') {
      line += 1
      lineStart = i + 1
    }
  }
  return { line, column: index - lineStart + 1 }
}
