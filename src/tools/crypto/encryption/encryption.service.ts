import CryptoJS from 'crypto-js'

export const encryptionAlgorithms = ['AES'] as const

export type EncryptionAlgorithm = (typeof encryptionAlgorithms)[number]

/** AES 加密（OpenSSL 加盐格式），返回 Base64 密文；密钥为空时抛出 Error */
export function encryptAES(plainText: string, secret: string): string {
  if (secret === '') {
    throw new Error('Secret must not be empty')
  }
  return CryptoJS.AES.encrypt(plainText, secret).toString()
}

/** AES 解密；密钥为空、密文为空、密钥错误或密文无效时抛出 Error */
export function decryptAES(cipherText: string, secret: string): string {
  if (secret === '') {
    throw new Error('Secret must not be empty')
  }
  if (cipherText === '') {
    throw new Error('Cipher text must not be empty')
  }
  const decrypted = CryptoJS.AES.decrypt(cipherText, secret)
  // PKCS7 填充非法（密钥错误/密文损坏）时 crypto-js 会得到负的 sigBytes
  if (decrypted.sigBytes < 0) {
    throw new Error('Decryption failed: wrong secret or invalid cipher text')
  }
  // 注意：OpenSSL 加盐格式没有完整性校验（MAC），错误密钥存在小概率解出
  // "恰好合法" 的乱码字节（无法根除）；此处把可检测的失败归一化为同一错误
  let plainText: string
  try {
    plainText = decrypted.toString(CryptoJS.enc.Utf8)
  } catch {
    // 错误密钥解出的字节偶发恰好通过填充校验但不是合法 UTF-8
    throw new Error('Decryption failed: wrong secret or invalid cipher text')
  }
  if (decrypted.sigBytes > 0 && plainText === '') {
    throw new Error('Decryption failed: wrong secret or invalid cipher text')
  }
  return plainText
}
