import CryptoJS from 'crypto-js'

export const encryptionAlgorithms = ['AES'] as const

export type EncryptionAlgorithm = (typeof encryptionAlgorithms)[number]

/**
 * v2 格式：`v2:` + Base64(salt ‖ iv ‖ ciphertext‖tag)。
 *
 * 旧版是 CryptoJS 的 OpenSSL 加盐串（`U2FsdGVkX1…`）：AES-CBC 无 MAC，密文可被静默
 * 改写而解出乱码不报错，且口令只经 1 轮 MD5 派生就能离线爆破。现在换成
 * AES-256-GCM（认证加密，篡改必然解密失败）+ PBKDF2-SHA-256 高轮次派生。
 */
const FORMAT_PREFIX = 'v2:'
const SALT_BYTES = 16
const IV_BYTES = 12
const KEY_BITS = 256
const GCM_TAG_BITS = 128
/** OWASP 对 PBKDF2-SHA-256 的当前建议量级 */
const KDF_ITERATIONS = 600_000

const encoder = new TextEncoder()
const decoder = new TextDecoder()

const DECRYPT_ERROR = 'Decryption failed: wrong secret or invalid cipher text'

/**
 * WebCrypto 只在安全上下文可用（https 或 localhost）。用 http 部署或从局域网 IP 打开时
 * crypto.subtle 是 undefined，此时必须显式告知，而不是抛一个看不懂的"加密失败"。
 */
export const isEncryptionAvailable = Boolean(
  globalThis.crypto && 'subtle' in globalThis.crypto && globalThis.crypto.subtle,
)

function assertAvailable(): void {
  if (!isEncryptionAvailable) {
    throw new Error(
      'WebCrypto unavailable: this tool requires a secure context (https or localhost)',
    )
  }
}

/** 密文是否来自旧版本：UI 据此提示"旧格式已解密，建议重新加密" */
export function isLegacyCipherText(cipherText: string): boolean {
  return cipherText !== '' && !cipherText.startsWith(FORMAT_PREFIX)
}

function assertSecret(secret: string): void {
  if (secret === '') {
    throw new Error('Secret must not be empty')
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

async function deriveKey(secret: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey('raw', encoder.encode(secret), 'PBKDF2', false, [
    'deriveKey',
  ])

  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: KDF_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: KEY_BITS },
    false,
    ['encrypt', 'decrypt'],
  )
}

/** AES-256-GCM 加密，返回带 `v2:` 前缀的 Base64 密文；密钥为空时抛出 Error */
export async function encryptAES(plainText: string, secret: string): Promise<string> {
  assertSecret(secret)
  assertAvailable()

  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const key = await deriveKey(secret, salt)
  const payload = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, tagLength: GCM_TAG_BITS },
    key,
    encoder.encode(plainText),
  )

  const sealed = new Uint8Array(SALT_BYTES + IV_BYTES + payload.byteLength)
  sealed.set(salt, 0)
  sealed.set(iv, SALT_BYTES)
  sealed.set(new Uint8Array(payload), SALT_BYTES + IV_BYTES)

  return `${FORMAT_PREFIX}${toBase64(sealed)}`
}

/** 旧版 CryptoJS AES-CBC 密文的解密路径，仅用于让用户取回历史数据 */
function decryptLegacy(cipherText: string, secret: string): string {
  const decrypted = CryptoJS.AES.decrypt(cipherText, secret)
  if (decrypted.sigBytes < 0) {
    throw new Error(DECRYPT_ERROR)
  }
  let plainText: string
  try {
    plainText = decrypted.toString(CryptoJS.enc.Utf8)
  } catch {
    throw new Error(DECRYPT_ERROR)
  }
  if (decrypted.sigBytes > 0 && plainText === '') {
    throw new Error(DECRYPT_ERROR)
  }
  return plainText
}

/** AES 解密；密钥为空、密文为空、密钥错误或密文被篡改时抛出 Error */
export async function decryptAES(cipherText: string, secret: string): Promise<string> {
  assertSecret(secret)
  if (cipherText === '') {
    throw new Error('Cipher text must not be empty')
  }

  if (!cipherText.startsWith(FORMAT_PREFIX)) {
    // 旧格式走 crypto-js，不依赖 WebCrypto：非安全上下文下用户仍能取回历史数据
    return decryptLegacy(cipherText, secret)
  }

  assertAvailable()
  let sealed: Uint8Array<ArrayBuffer>
  try {
    sealed = fromBase64(cipherText.slice(FORMAT_PREFIX.length))
  } catch {
    throw new Error(DECRYPT_ERROR)
  }
  if (sealed.byteLength <= SALT_BYTES + IV_BYTES) {
    throw new Error(DECRYPT_ERROR)
  }

  const salt = sealed.subarray(0, SALT_BYTES)
  const iv = sealed.subarray(SALT_BYTES, SALT_BYTES + IV_BYTES)
  const payload = sealed.subarray(SALT_BYTES + IV_BYTES)
  const key = await deriveKey(secret, salt)

  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, tagLength: GCM_TAG_BITS },
      key,
      payload,
    )
    return decoder.decode(plain)
  } catch {
    // GCM 校验失败：密钥不对，或密文/标签被动过——这正是旧格式做不到的事
    throw new Error(DECRYPT_ERROR)
  }
}
