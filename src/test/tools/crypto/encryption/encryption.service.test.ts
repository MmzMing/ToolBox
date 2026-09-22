import CryptoJS from 'crypto-js'
import { describe, expect, it } from 'vitest'

import {
  decryptAES,
  encryptAES,
  isLegacyCipherText,
} from '@/tools/crypto/encryption/encryption.service'

/** 旧版 CryptoJS 的 OpenSSL 加盐格式，用来模拟用户手里的历史密文 */
function legacyCipher(plainText: string, secret: string): string {
  return CryptoJS.AES.encrypt(plainText, secret).toString()
}

describe('encryptAES', () => {
  it('produces a versioned v2 envelope', async () => {
    const cipher = await encryptAES('hello toolbox', 'secret-key')
    expect(cipher.startsWith('v2:')).toBe(true)
    expect(isLegacyCipherText(cipher)).toBe(false)
  })

  it('uses a fresh salt and iv so identical input yields different cipher', async () => {
    const [first, second] = await Promise.all([
      encryptAES('same', 'secret-key'),
      encryptAES('same', 'secret-key'),
    ])
    expect(first).not.toBe(second)
    expect(await decryptAES(first, 'secret-key')).toBe(await decryptAES(second, 'secret-key'))
  })

  it('throws on empty secret', async () => {
    await expect(() => encryptAES('plain', '')).rejects.toThrowError(/secret/i)
  })
})

describe('decryptAES', () => {
  it('round-trips unicode plaintext and empty plaintext', async () => {
    const unicode = await encryptAES('中文 + emoji 🎉', '密钥')
    expect(await decryptAES(unicode, '密钥')).toBe('中文 + emoji 🎉')

    const empty = await encryptAES('', 'secret-key')
    expect(await decryptAES(empty, 'secret-key')).toBe('')
  })

  it('rejects a wrong secret', async () => {
    const cipher = await encryptAES('top secret', 'right-key')
    await expect(() => decryptAES(cipher, 'wrong-key')).rejects.toThrowError(/decryption failed/i)
  })

  /* 这是换掉 AES-CBC 的全部理由：旧格式没有 MAC，改一个字节照样"解密成功"吐出乱码 */
  it('detects a single flipped ciphertext byte', async () => {
    const cipher = await encryptAES('integrity matters', 'secret-key')
    const body = cipher.slice(3)
    const bytes = atob(body).split('')
    const last = bytes.length - 3
    bytes[last] = String.fromCharCode((bytes[last].charCodeAt(0) + 1) % 256)
    const tampered = `v2:${btoa(bytes.join(''))}`

    expect(tampered).not.toBe(cipher)
    await expect(() => decryptAES(tampered, 'secret-key')).rejects.toThrowError(
      /decryption failed/i,
    )
  })

  it('normalizes malformed v2 payloads into decryption errors', async () => {
    await expect(() => decryptAES('v2:not-base64!!', 'secret-key')).rejects.toThrowError(
      /decryption failed/i,
    )
    await expect(() => decryptAES(`v2:${btoa('short')}`, 'secret-key')).rejects.toThrowError(
      /decryption failed/i,
    )
  })

  it('throws on empty cipher text and empty secret', async () => {
    await expect(() => decryptAES('', 'secret-key')).rejects.toThrowError(/cipher text/i)
    await expect(() => decryptAES('v2:AAA', '')).rejects.toThrowError(/secret/i)
  })
})

describe('legacy AES-CBC cipher text', () => {
  it('is still readable so nobody is locked out of old data', async () => {
    const cipher = legacyCipher('from the old version', 'secret-key')
    expect(isLegacyCipherText(cipher)).toBe(true)
    expect(await decryptAES(cipher, 'secret-key')).toBe('from the old version')
  })

  it('reports a wrong key as a decryption failure', async () => {
    const cipher = legacyCipher('x', 'right-key')
    await expect(() => decryptAES(cipher, 'wrong-key')).rejects.toThrowError(/decryption failed/i)
  })
})
