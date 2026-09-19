import { describe, expect, it } from 'vitest'

import {
  generateRsaKeyPair,
  rsaKeySizes,
  type RsaKeySize,
} from '@/tools/crypto/rsa-key-pair-generator/rsa-key-pair-generator.service'

const PUBLIC_PEM_PATTERN =
  /^-----BEGIN PUBLIC KEY-----\n([A-Za-z0-9+/=\n]+)\n-----END PUBLIC KEY-----$/
const PRIVATE_PEM_PATTERN =
  /^-----BEGIN PRIVATE KEY-----\n([A-Za-z0-9+/=\n]+)\n-----END PRIVATE KEY-----$/

function decodePemBody(pem: string, pattern: RegExp): Uint8Array {
  const base64 = pem.match(pattern)?.[1]?.replaceAll('\n', '') ?? ''
  const binary = atob(base64)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

describe('generateRsaKeyPair', () => {
  it('generates a 2048-bit key pair as PEM', async () => {
    const { publicKeyPem, privateKeyPem } = await generateRsaKeyPair(2048)

    expect(publicKeyPem).toMatch(PUBLIC_PEM_PATTERN)
    expect(privateKeyPem).toMatch(PRIVATE_PEM_PATTERN)

    const bodyLines = publicKeyPem.split('\n').slice(1, -1)
    for (const [index, line] of bodyLines.entries()) {
      const isLastLine = index === bodyLines.length - 1
      expect(line).toMatch(isLastLine ? /^[A-Za-z0-9+/]+={0,2}$/ : /^[A-Za-z0-9+/]{64}$/)
    }
  })

  it('wraps the public key as SPKI DER (RSA modulus fits 2048 bits)', async () => {
    const { publicKeyPem } = await generateRsaKeyPair(2048)
    const der = decodePemBody(publicKeyPem, PUBLIC_PEM_PATTERN)

    expect(der[0]).toBe(0x30)
    expect(der[1]).toBe(0x82)
    expect(der.byteLength).toBeGreaterThan(256)
  })

  it('wraps the private key as PKCS8 DER', async () => {
    const { privateKeyPem } = await generateRsaKeyPair(2048)
    const der = decodePemBody(privateKeyPem, PRIVATE_PEM_PATTERN)

    expect(der[0]).toBe(0x30)
    expect(der[1]).toBe(0x82)
    expect(der.byteLength).toBeGreaterThan(1024)
  })

  it('rejects unsupported key sizes', async () => {
    await expect(generateRsaKeyPair(1024 as RsaKeySize)).rejects.toThrowError(/key size/i)
    await expect(generateRsaKeyPair(2049 as RsaKeySize)).rejects.toThrowError(/key size/i)
  })

  it('only exposes the documented key sizes', () => {
    expect([...rsaKeySizes]).toEqual([2048, 3072, 4096])
  })
})
