import { randomBytes } from '@/utils/random'
import { encodeSecret, type EncodedSecret } from './hmac.service'

export const SYMMETRIC_KEY_KINDS = {
  'aes-128': 16,
  'aes-192': 24,
  'aes-256': 32,
  'chacha20-poly1305': 32,
  'hmac-sha256': 32,
  'hmac-sha512': 64,
} as const

export type SymmetricKeyKind = keyof typeof SYMMETRIC_KEY_KINDS
export const SYMMETRIC_KEY_KIND_LIST = Object.keys(SYMMETRIC_KEY_KINDS) as SymmetricKeyKind[]

/** GCM/ChaCha20 用 12 字节 nonce，CBC/CTR 用 16 字节 IV */
export const IV_KINDS = {
  'aes-gcm': 12,
  'chacha20-poly1305': 12,
  'aes-cbc': 16,
  'aes-ctr': 16,
} as const

export type IvKind = keyof typeof IV_KINDS
export const IV_KIND_LIST = Object.keys(IV_KINDS) as IvKind[]

export const SALT_DEFAULT_BYTES = 16

/** 生成对称密钥；未知类型抛错而不是回退到某个默认长度 */
export function generateSymmetricKey(kind: SymmetricKeyKind): EncodedSecret {
  const bytes = SYMMETRIC_KEY_KINDS[kind]
  if (!bytes) {
    throw new Error(`Unknown symmetric key kind "${kind}"`)
  }
  return encodeSecret(randomBytes(bytes))
}

export function generateInitializationVector(kind: IvKind): EncodedSecret {
  const bytes = IV_KINDS[kind]
  if (!bytes) {
    throw new Error(`Unknown IV kind "${kind}"`)
  }
  return encodeSecret(randomBytes(bytes))
}

export function generateSalt(bytes = SALT_DEFAULT_BYTES): EncodedSecret {
  if (!Number.isInteger(bytes) || bytes < 8 || bytes > 128) {
    throw new Error('Salt length must be an integer between 8 and 128')
  }
  return encodeSecret(randomBytes(bytes))
}

export interface SecretSnippets {
  env: string
  javascript: string
  java: string
  go: string
}

/** 把密钥写成四种语言/格式的字面量，省去手工加引号与转义 */
export function secretSnippets(name: string, secret: EncodedSecret): SecretSnippets {
  const javaBytes = secret.hex
    .match(/../g)
    ?.map((pair) => `0x${pair}`)
    .join(', ')
  return {
    env: `${name.toUpperCase()}=${secret.base64Url}`,
    javascript: `const ${toCamel(name)} = Buffer.from('${secret.hex}', 'hex')`,
    java: `byte[] ${toCamel(name)} = new byte[] { ${javaBytes} };`,
    go: `${toSnake(name)}, _ := hex.DecodeString("${secret.hex}")`,
  }
}

function toCamel(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+(.)/g, (_, character: string) => character.toUpperCase())
}

function toSnake(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_')
}
