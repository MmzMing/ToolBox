import type { Dialect } from './request-model'

export interface DialectSpec {
  readonly dialect: Dialect
  readonly executable: string
  /** 续行标记本身（不含换行与缩进）：`\`、`^`、反引号 */
  readonly continuation: string
  /** 是否能用 `$'...'` ANSI-C 引用表达控制字符 */
  readonly ansiC: boolean
  /** 值里出现裸换行时该方言是否还能正确执行 */
  readonly allowsLiteralNewline: boolean
  quote(value: string): string
}

/** 需要转成 `$'...'` 的控制字符；用码点扫描而不是正则，避免控制字符字面量 */
function hasControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i)
    if (code <= 0x1f || code === 0x7f) return true
  }
  return false
}

function escapeAnsiC(value: string): string {
  let out = ''
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0
    if (ch === "'") out += "\\'"
    else if (ch === '\\') out += '\\\\'
    else if (ch === '\n') out += '\\n'
    else if (ch === '\r') out += '\\r'
    else if (ch === '\t') out += '\\t'
    else if (ch === '\b') out += '\\b'
    else if (ch === '\f') out += '\\f'
    else if (ch === '\v') out += '\\v'
    else if (ch === '\u0007') out += '\\a'
    else if (code < 0x20 || code === 0x7f) out += `\\x${code.toString(16).padStart(2, '0')}`
    else out += ch
  }
  return out
}

/** bash：单引号包裹，内部单引号用 `'\''` 拆开重接 */
function quoteBashValue(value: string): string {
  if (hasControlChar(value)) return `$'${escapeAnsiC(value)}'`
  return `'${value.replace(/'/g, `'\\''`)}'`
}

/**
 * cmd：交给 curl.exe 的 CRT 参数解析器，所以内部双引号写成 `\"`。
 * 单个 `%` 只在 .bat 里才需要写成 `%%`，交互执行时反而会露出两个百分号，
 * 因此这里保持原样，由 validateModel 提醒。
 */
function quoteCmdValue(value: string): string {
  return `"${value.replace(/(["\\])/g, '\\$1').replace(/\r?\n/g, ' ')}"`
}

/** PowerShell：单引号包裹，内部单引号翻倍 */
function quotePowerShellValue(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

export const DIALECT_SPECS: Readonly<Record<Dialect, DialectSpec>> = {
  bash: {
    dialect: 'bash',
    executable: 'curl',
    continuation: '\\',
    ansiC: true,
    allowsLiteralNewline: true,
    quote: quoteBashValue,
  },
  cmd: {
    dialect: 'cmd',
    executable: 'curl',
    continuation: '^',
    ansiC: false,
    allowsLiteralNewline: false,
    quote: quoteCmdValue,
  },
  powershell: {
    dialect: 'powershell',
    executable: 'curl.exe',
    continuation: '`',
    ansiC: false,
    allowsLiteralNewline: true,
    quote: quotePowerShellValue,
  },
}

/**
 * 把已经拼好的片段连成最终命令。多行时缩进两格，与 Chrome DevTools 的产物一致；
 * 续行标记后不能有任何空格，否则 cmd 与 PowerShell 会失效。
 */
export function joinArguments(parts: readonly string[], spec: DialectSpec, multiline: boolean) {
  if (!multiline) return parts.join(' ')
  return parts.join(` ${spec.continuation}\n  `)
}

export function quoteFor(spec: DialectSpec, value: string): string {
  return spec.quote(value)
}
