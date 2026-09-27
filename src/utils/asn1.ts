/**
 * 极简 DER（X.690 确定长度形式）读写，只覆盖密钥编码需要的子集：
 * SEQUENCE / INTEGER / OCTET STRING / BIT STRING / OBJECT IDENTIFIER / NULL / 上下文标签。
 * 不接受 BER 不定长与分块构造，畸形输入一律抛错——密钥解析宁可在导入时报错，也不静默产出错误密钥。
 */

import { concatBytes } from './bytes'

export const Asn1Tag = {
  boolean: 0x01,
  integer: 0x02,
  bitString: 0x03,
  octetString: 0x04,
  null: 0x05,
  objectIdentifier: 0x06,
  utf8String: 0x0c,
  sequence: 0x30,
} as const

const CONSTRUCTED_BIT = 0x20
const MAX_LENGTH_BYTES = 4

function encodeLengthBytes(length: number): number[] {
  if (length < 0x80) {
    return [length]
  }
  const bytes: number[] = []
  let rest = length
  while (rest > 0) {
    bytes.unshift(rest % 0x100)
    rest = Math.floor(rest / 0x100)
  }
  return [0x80 | bytes.length, ...bytes]
}

/** 单个 TLV：tag + 确定长度 + 内容 */
export function derTlv(tag: number, content: Uint8Array): Uint8Array {
  return concatBytes(new Uint8Array([tag, ...encodeLengthBytes(content.length)]), content)
}

/** 上下文相关的构造标签，如 SEC1 ECPrivateKey 里的 `[1] BIT STRING`（tag = 0xa0 | index） */
export function derContextConstructed(index: number, content: Uint8Array): Uint8Array {
  if (index < 0 || index > 0x1f) {
    throw new Error(`DER: context tag class number must be within 0..31, got ${index}`)
  }
  return derTlv(0xa0 | index, content)
}

export function derSequence(...members: Uint8Array[]): Uint8Array {
  return derTlv(Asn1Tag.sequence, concatBytes(...members))
}

/**
 * 正整数的 DER 内容：按无符号大端字节去掉多余前导零，再在最高位为 1 时补 0x00 符号字节。
 * 与 SSH mpint 的编码规则完全一致，因此两套输出共用这一条规则。
 */
export function derIntegerContent(magnitude: Uint8Array): Uint8Array {
  let start = 0
  while (start < magnitude.length - 1 && magnitude[start] === 0) {
    start++
  }
  const trimmed = magnitude.subarray(start)
  const needsPadding = (trimmed[0] & 0x80) !== 0
  return needsPadding ? new Uint8Array([0x00, ...trimmed]) : new Uint8Array(trimmed)
}

export function derInteger(magnitude: Uint8Array): Uint8Array {
  return derTlv(Asn1Tag.integer, derIntegerContent(magnitude))
}

export function derNull(): Uint8Array {
  return new Uint8Array([Asn1Tag.null, 0x00])
}

export function derOctetString(bytes: Uint8Array): Uint8Array {
  return derTlv(Asn1Tag.octetString, bytes)
}

/** 密钥字节都以 0 个未使用位封装 */
export function derBitString(bytes: Uint8Array): Uint8Array {
  return derTlv(Asn1Tag.bitString, new Uint8Array([0x00, ...bytes]))
}

export function derObjectIdentifier(dotted: string): Uint8Array {
  const arcs = dotted.split('.').map((part) => {
    const value = Number(part)
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`DER: invalid OID arc "${part}" in ${dotted}`)
    }
    return value
  })
  const [first, second] = arcs
  if (first === undefined || second === undefined) {
    throw new Error(`DER: OID needs at least two arcs, got "${dotted}"`)
  }
  if (first > 2 || (first < 2 && second > 39)) {
    throw new Error(`DER: OID arcs 1-2 out of range for "${dotted}"`)
  }
  const content: number[] = []
  const append = (value: number) => {
    const stack: number[] = [value % 0x80]
    let rest = Math.floor(value / 0x80)
    while (rest > 0) {
      stack.unshift((rest % 0x80) | 0x80)
      rest = Math.floor(rest / 0x80)
    }
    content.push(...stack)
  }
  append(first * 40 + second)
  for (const arc of arcs.slice(2)) {
    append(arc)
  }
  return derTlv(Asn1Tag.objectIdentifier, new Uint8Array(content))
}

export interface DerElement {
  tag: number
  /** 原始内容字节（不含 tag 与长度） */
  content: Uint8Array
  /** 构造类型（tag & 0x20）解析出的子元素，原生类型为空数组 */
  children: DerElement[]
}

function readLength(bytes: Uint8Array, offset: number): { length: number; headerLength: number } {
  const first = bytes[offset]
  if (first === undefined) {
    throw new Error('DER: missing length octet')
  }
  if (first < 0x80) {
    return { length: first, headerLength: 1 }
  }
  if (first === 0x80) {
    throw new Error('DER: indefinite length is not valid DER')
  }
  const count = first & 0x7f
  if (count > MAX_LENGTH_BYTES) {
    throw new Error(`DER: length of ${count} octets exceeds the ${MAX_LENGTH_BYTES}-octet limit`)
  }
  let length = 0
  for (let i = 0; i < count; i++) {
    const octet = bytes[offset + 1 + i]
    if (octet === undefined) {
      throw new Error('DER: truncated length octets')
    }
    length = length * 0x100 + octet
  }
  if (length < 0x80) {
    throw new Error('DER: non-minimal length encoding')
  }
  return { length, headerLength: 1 + count }
}

function readElement(bytes: Uint8Array, offset: number): { element: DerElement; next: number } {
  const tag = bytes[offset]
  if (tag === undefined) {
    throw new Error('DER: unexpected end of buffer')
  }
  const { length, headerLength } = readLength(bytes, offset + 1)
  const contentStart = offset + 1 + headerLength
  const next = contentStart + length
  if (next > bytes.length) {
    throw new Error(`DER: content of ${length} bytes is truncated at offset ${contentStart}`)
  }
  const content = new Uint8Array(bytes.subarray(contentStart, next))
  const element: DerElement = { tag, content, children: [] }
  if ((tag & CONSTRUCTED_BIT) !== 0) {
    let cursor = 0
    while (cursor < content.length) {
      const child = readElement(content, cursor)
      element.children.push(child.element)
      cursor = child.next
    }
  }
  return { element, next }
}

/** 解析整段 DER，尾部多余字节视为格式错误 */
export function parseDer(der: Uint8Array): DerElement {
  const { element, next } = readElement(der, 0)
  if (next !== der.length) {
    throw new Error(`DER: ${der.length - next} trailing bytes after the outer element`)
  }
  return element
}

/** 取子元素，越界即抛错（密钥结构缺字段就是格式不对，不该返回 undefined 让调用方猜） */
export function derChild(element: DerElement, index: number, context: string): DerElement {
  const child = element.children[index]
  if (!child) {
    throw new Error(`DER: ${context} is missing child #${index + 1}`)
  }
  return child
}

export function derExpectTag(element: DerElement, tag: number, context: string): DerElement {
  if (element.tag !== tag) {
    throw new Error(
      `DER: ${context} expected tag 0x${tag.toString(16).padStart(2, '0')}, got 0x${element.tag
        .toString(16)
        .padStart(2, '0')}`,
    )
  }
  return element
}

/** INTEGER 内容 → 无符号大端字节（去掉符号扩展字节） */
export function derIntegerMagnitude(element: DerElement): Uint8Array {
  const content = element.content
  if (content.length === 0) {
    throw new Error('DER: INTEGER content is empty')
  }
  if (content[0] === 0x00 && content.length > 1) {
    return new Uint8Array(content.subarray(1))
  }
  return content
}

/** BIT STRING 内容 → 去掉首字节「未使用位个数」（本工具只处理 0 位的情形） */
export function derBitStringBytes(element: DerElement): Uint8Array {
  if (element.content[0] !== 0x00) {
    throw new Error('DER: BIT STRING with unused bits is not supported')
  }
  return new Uint8Array(element.content.subarray(1))
}

export function derObjectIdentifierText(element: DerElement): string {
  const values: number[] = []
  let value = 0
  let openArc = false
  for (const octet of element.content) {
    openArc = true
    value = value * 0x80 + (octet & 0x7f)
    if ((octet & 0x80) === 0) {
      values.push(value)
      value = 0
      openArc = false
    }
  }
  if (openArc) {
    throw new Error('DER: OBJECT IDENTIFIER ends with a continuation octet')
  }
  if (values.length === 0) {
    throw new Error('DER: OBJECT IDENTIFIER content is empty')
  }
  // 首字节本身也是 base-128：它编码的是 40*第一弧 + 第二弧
  const [root, ...rest] = values
  const arcs = root < 80 ? [Math.floor(root / 40), root % 40] : [2, root - 80]
  return [...arcs, ...rest].join('.')
}
