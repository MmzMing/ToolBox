import CryptoJS from 'crypto-js'

export const hmacAlgorithms = ['HMACMD5', 'HMACSHA1', 'HMACSHA256', 'HMACSHA512'] as const

export type HmacAlgorithm = (typeof hmacAlgorithms)[number]

const HMAC_FUNCTIONS: Record<HmacAlgorithm, (message: string, secret: string) => string> = {
  HMACMD5: (message, secret) => CryptoJS.HmacMD5(message, secret).toString(CryptoJS.enc.Hex),
  HMACSHA1: (message, secret) => CryptoJS.HmacSHA1(message, secret).toString(CryptoJS.enc.Hex),
  HMACSHA256: (message, secret) => CryptoJS.HmacSHA256(message, secret).toString(CryptoJS.enc.Hex),
  HMACSHA512: (message, secret) => CryptoJS.HmacSHA512(message, secret).toString(CryptoJS.enc.Hex),
}

/** 计算十六进制 HMAC 消息认证码，密钥为空时抛出 Error */
export function computeHmac(algorithm: HmacAlgorithm, message: string, secret: string): string {
  if (secret === '') {
    throw new Error('Secret must not be empty')
  }
  return HMAC_FUNCTIONS[algorithm](message, secret)
}
