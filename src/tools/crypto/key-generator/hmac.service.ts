import CryptoJS from 'crypto-js'

import { bytesToBase64, bytesToBase64Url } from '@/utils/base64'
import { bytesToHex } from '@/utils/bytes'
import { randomBytes } from '@/utils/random'

export const hmacAlgorithms = ['HMACMD5', 'HMACSHA1', 'HMACSHA256', 'HMACSHA512'] as const

export type HmacAlgorithm = (typeof hmacAlgorithms)[number]

/** RFC 2104：密钥短于摘要长度会削弱强度，长于块长会先被哈希，因此常用档位是 16/32/48/64 字节 */
export const HMAC_SECRET_SIZES = [16, 32, 48, 64] as const

export type HmacSecretSize = (typeof HMAC_SECRET_SIZES)[number]

export interface EncodedSecret {
  hex: string
  base64: string
  base64Url: string
}

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

export function encodeSecret(bytes: Uint8Array): EncodedSecret {
  return {
    hex: bytesToHex(bytes),
    base64: bytesToBase64(bytes),
    base64Url: bytesToBase64Url(bytes),
  }
}

/** 生成 HMAC 密钥；字节数不在档位内时抛错，避免手输一个弱长度 */
export function generateHmacSecret(bytes: number): EncodedSecret {
  if (!HMAC_SECRET_SIZES.includes(bytes as HmacSecretSize)) {
    throw new Error(`Secret size must be one of ${HMAC_SECRET_SIZES.join(', ')}`)
  }
  return encodeSecret(randomBytes(bytes))
}
