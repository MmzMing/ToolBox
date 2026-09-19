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
  const plainText = decrypted.toString(CryptoJS.enc.Utf8)
  if (decrypted.sigBytes > 0 && plainText === '') {
    throw new Error('Decryption failed: wrong secret or invalid cipher text')
  }
  return plainText
}
