import { base64ToBytes, bytesToBase64 } from './base64'

/** label 会直接拼进 BEGIN/END 头，限定为大写字母数字空格，避免把换行与假头注入复制内容 */
const PEM_LABEL_PATTERN = /^[A-Z0-9 ]+$/
const PEM_BLOCK_PATTERN = /-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/

/**
 * DER → PEM。RFC 7468 不强制列宽，实测 openssl 用 64 列、OpenSSH 私钥文件用 70 列，
 * 因此列宽做成参数，让输出能与对应工具的产物逐字节对齐。
 */
export function toPem(label: string, der: Uint8Array, columns = 64): string {
  if (!PEM_LABEL_PATTERN.test(label)) {
    throw new Error(`PEM: invalid label "${label}"`)
  }
  if (!Number.isInteger(columns) || columns < 16 || columns > 76) {
    throw new Error(`PEM: columns must be an integer between 16 and 76, got ${columns}`)
  }
  const body = bytesToBase64(der).replace(new RegExp(`(.{${columns}})`, 'g'), '$1\n')
  return `-----BEGIN ${label}-----\n${body}\n-----END ${label}-----\n`
}

/** 取第一个 PEM 块；传入 allowedLabels 时校验类型，避免把公钥当私钥继续处理 */
export function pemToDer(
  text: string,
  allowedLabels?: readonly string[],
): { label: string; der: Uint8Array } {
  const trimmed = text.trim()
  const blocks = trimmed.match(/-----BEGIN [A-Z0-9 ]+-----/g) ?? []
  if (blocks.length === 0) {
    throw new Error('PEM: no BEGIN/END block found')
  }
  if (blocks.length > 1) {
    throw new Error('PEM: multiple blocks in one input are not supported')
  }
  const match = PEM_BLOCK_PATTERN.exec(trimmed)
  if (!match) {
    throw new Error('PEM: block is missing its matching END line')
  }
  const [, label, body] = match
  if (allowedLabels && !allowedLabels.includes(label)) {
    throw new Error(`PEM: unexpected type "${label}", expected one of: ${allowedLabels.join(', ')}`)
  }
  return { label, der: base64ToBytes(body) }
}

export function looksLikePem(text: string): boolean {
  return PEM_BLOCK_PATTERN.test(text.trim())
}
