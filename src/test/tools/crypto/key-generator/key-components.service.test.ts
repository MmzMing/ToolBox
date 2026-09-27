import { describe, expect, it } from 'vitest'

import { Asn1Tag, derChild, parseDer } from '@/utils/asn1'
import { bytesToHex, hexToBytes } from '@/utils/bytes'
import {
  KEY_ALGORITHM_OID,
  readCurve25519Seed,
  readEcPrivateComponents,
  readRsaPrivateComponents,
  unwrapPrivateKeyInfo,
} from '@/tools/crypto/key-generator/key-components.service'
import {
  curve25519KeyFromSeed,
  generateKeyPair,
} from '@/tools/crypto/key-generator/keypair.service'

const SEED = hexToBytes('9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60')

describe('unwrapPrivateKeyInfo', () => {
  it('leaves the RSA parameters absent-as-NULL and exposes the PKCS#1 DER', async () => {
    const key = await generateKeyPair({ algorithm: 'rsa', bits: 2048 })
    const info = unwrapPrivateKeyInfo(key.pkcs8Der)
    expect(info.algorithmOid).toBe(KEY_ALGORITHM_OID.rsaEncryption)
    expect(info.parametersOid).toBeUndefined()
    const rsa = parseDer(info.innerDer)
    expect(rsa.tag).toBe(Asn1Tag.sequence)
    // PKCS#1 RSAPrivateKey 有 9 个成员：version + 6 个分量 + exponent1 + exponent2
    expect(rsa.children).toHaveLength(9)
    expect(derChild(rsa, 0, 'version').content).toEqual(hexToBytes('00'))
  })

  it('surfaces the curve OID for EC keys', async () => {
    const key = await generateKeyPair({ algorithm: 'ecdsa', curve: 'P-521' })
    const info = unwrapPrivateKeyInfo(key.pkcs8Der)
    expect(info.algorithmOid).toBe(KEY_ALGORITHM_OID.ecPublicKey)
    expect(info.parametersOid).toBe('1.3.132.0.35')
  })

  it('refuses to parse a non-PKCS#8 blob', () => {
    expect(() => unwrapPrivateKeyInfo(new Uint8Array([0x05, 0x00]))).toThrowError(/PrivateKeyInfo/)
  })
})

describe('readRsaPrivateComponents', () => {
  it('returns magnitudes without the DER sign byte', async () => {
    const key = await generateKeyPair({ algorithm: 'rsa', bits: 2048 })
    const { n, e, d, p, q, iqmp } = readRsaPrivateComponents(key.pkcs8Der)
    expect(bytesToHex(e)).toBe('010001')
    expect(n).toHaveLength(256)
    expect([p.length, q.length]).toContain(128)
    expect(d.length).toBeLessThanOrEqual(256)
    expect(iqmp.length).toBeLessThanOrEqual(128)
  })

  it('rejects an EC key handed to the RSA reader', async () => {
    const key = await generateKeyPair({ algorithm: 'ecdsa', curve: 'P-256' })
    expect(() => readRsaPrivateComponents(key.pkcs8Der)).toThrowError(/Expected an RSA key/)
  })
})

const CURVE_OIDS: Record<string, string> = {
  'P-256': '1.2.840.10045.3.1.7',
  'P-384': '1.3.132.0.34',
  'P-521': '1.3.132.0.35',
}

describe('readEcPrivateComponents', () => {
  it.each(['P-256', 'P-384', 'P-521'] as const)(
    'exposes a %s scalar and uncompressed point',
    async (curve) => {
      const key = await generateKeyPair({ algorithm: 'ecdsa', curve })
      const { d, point, curveOid } = readEcPrivateComponents(key.pkcs8Der)
      const fieldBytes = { 'P-256': 32, 'P-384': 48, 'P-521': 66 }[curve]
      expect(d).toHaveLength(fieldBytes)
      expect(curveOid).toBe(CURVE_OIDS[curve])
      // 未压缩点 = 0x04 ‖ X ‖ Y，且坐标已按域宽左补零
      expect(point[0]).toBe(0x04)
      expect(point).toHaveLength(1 + fieldBytes * 2)
    },
  )

  it('rejects an RSA key handed to the EC reader', async () => {
    const key = await generateKeyPair({ algorithm: 'rsa', bits: 2048 })
    expect(() => readEcPrivateComponents(key.pkcs8Der)).toThrowError(/Expected an EC key/)
  })
})

describe('readCurve25519Seed', () => {
  it('recovers the exact seed the key was built from', () => {
    const key = curve25519KeyFromSeed('ed25519', SEED)
    const { algorithmOid, seed } = readCurve25519Seed(key.pkcs8Der)
    expect(algorithmOid).toBe(KEY_ALGORITHM_OID.ed25519)
    expect(bytesToHex(seed)).toBe(bytesToHex(SEED))
  })

  it('names the X25519 variant and rejects other algorithms', () => {
    const x = curve25519KeyFromSeed('x25519', SEED)
    expect(readCurve25519Seed(x.pkcs8Der).algorithmOid).toBe(KEY_ALGORITHM_OID.x25519)
    return generateKeyPair({ algorithm: 'rsa', bits: 2048 }).then((rsa) => {
      expect(() => readCurve25519Seed(rsa.pkcs8Der)).toThrowError(/Expected an OKP key/)
    })
  })
})
