import CryptoJS from 'crypto-js'

import { bytesToBase64 } from '@/utils/base64'
import { bytesToHex } from '@/utils/bytes'

export type FingerprintAlgorithm = 'SHA256' | 'MD5'

/**
 * SSH 指纹。`ssh-keygen -l` 用的是**标准 base64 去掉尾部填充**，不是 base64url：
 * 实测输出里会出现 `+` 与 `/`，写成 url 安全字母表就会与所有命令行工具对不上。
 */
export async function sshFingerprint(
  blob: Uint8Array<ArrayBuffer>,
  algorithm: FingerprintAlgorithm,
): Promise<string> {
  if (algorithm === 'MD5') {
    // MD5 不在 WebCrypto 的支持列表里，走已在依赖中的 crypto-js
    const hex = CryptoJS.MD5(CryptoJS.enc.Hex.parse(bytesToHex(blob))).toString(CryptoJS.enc.Hex)
    return `MD5:${(hex.match(/../g) ?? []).join(':')}`
  }
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', blob))
  return `SHA256:${bytesToBase64(hash).replace(/=+$/, '')}`
}
