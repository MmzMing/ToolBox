import { describe, expect, it } from 'vitest'

import { parseDer, derObjectIdentifierText, derChild, Asn1Tag } from '@/utils/asn1'
import { bytesToHex, hexToBytes } from '@/utils/bytes'
import {
  EC_CURVES,
  RSA_KEY_SIZES,
  curve25519KeyFromSeed,
  generateKeyPair,
} from '@/tools/crypto/key-generator/keypair.service'

/** RFC 8410 §10 的确定性测试向量 */
const SEED = hexToBytes('9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60')
const PUBLIC = hexToBytes('d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a')

describe('curve25519KeyFromSeed', () => {
  it('reproduces the RFC 8410 Ed25519 PKCS#8 and SPKI byte for byte', () => {
    const key = curve25519KeyFromSeed('ed25519', SEED)
    expect(bytesToHex(key.pkcs8Der)).toBe(`302e020100300506032b657004220420${bytesToHex(SEED)}`)
    expect(bytesToHex(key.spkiDer)).toBe(`302a300506032b6570032100${bytesToHex(PUBLIC)}`)
  })

  it('uses the X25519 OID one arc away', () => {
    const key = curve25519KeyFromSeed('x25519', SEED)
    const algorithm = derChild(parseDer(key.pkcs8Der), 1, 'AlgorithmIdentifier')
    expect(derObjectIdentifierText(derChild(algorithm, 0, 'oid'))).toBe('1.3.101.110')
    expect(key.publicJwk).toEqual({ kty: 'OKP', crv: 'X25519', x: key.publicJwk.x })
  })

  it('derives JWK members in unpadded base64url without key_ops', () => {
    const key = curve25519KeyFromSeed('ed25519', SEED)
    expect(key.privateJwk).toMatchObject({ kty: 'OKP', crv: 'Ed25519' })
    expect(key.privateJwk.d).toBe('nWGxne_9WmC6hEr0kuwsxERJxWl7MmkZcDusAxyuf2A')
    expect(key.publicJwk.x).toBe('11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo')
    expect(key.privateJwk.key_ops).toBeUndefined()
  })

  it('rejects a seed that is not 32 bytes', () => {
    expect(() => curve25519KeyFromSeed('ed25519', new Uint8Array(31))).toThrowError(
      /must be 32 bytes/,
    )
  })
})

describe('generateKeyPair', () => {
  it.each(RSA_KEY_SIZES)(
    'produces a parseable RSA-%i PKCS#8 with rsaEncryption + NULL',
    async (bits) => {
      const key = await generateKeyPair({ algorithm: 'rsa', bits })
      expect(key.algorithm).toBe('rsa')
      expect(key.bits).toBe(bits)
      const info = parseDer(key.pkcs8Der)
      const algorithm = derChild(info, 1, 'AlgorithmIdentifier')
      expect(derObjectIdentifierText(derChild(algorithm, 0, 'oid'))).toBe('1.2.840.113549.1.1.1')
      expect(derChild(algorithm, 1, 'params').tag).toBe(Asn1Tag.null)
      expect(key.privateJwk.kty).toBe('RSA')
      expect(key.raw).toBeUndefined()
    },
  )

  const CURVE_OIDS: Record<string, string> = {
    'P-256': '1.2.840.10045.3.1.7',
    'P-384': '1.3.132.0.34',
    'P-521': '1.3.132.0.35',
  }

  it.each(EC_CURVES)('produces a %s EC key whose curve OID round-trips', async (curve) => {
    const key = await generateKeyPair({ algorithm: 'ecdsa', curve })
    const algorithm = derChild(parseDer(key.pkcs8Der), 1, 'AlgorithmIdentifier')
    expect(derObjectIdentifierText(derChild(algorithm, 1, 'curve'))).toBe(CURVE_OIDS[curve])
    expect(key.publicJwk).toMatchObject({ kty: 'EC', crv: curve })
  })

  it('rejects an unsupported key size', async () => {
    await expect(generateKeyPair({ algorithm: 'rsa', bits: 512 as never })).rejects.toThrowError(
      /Key size must be one of/,
    )
  })

  it('rejects an unsupported curve', async () => {
    await expect(
      generateKeyPair({ algorithm: 'ecdsa', curve: 'P-192' as never }),
    ).rejects.toThrowError(/Curve must be one of/)
  })

  it('gives Ed25519 and X25519 different encodings from the same seed', () => {
    const ed = curve25519KeyFromSeed('ed25519', SEED)
    const x = curve25519KeyFromSeed('x25519', SEED)
    expect(ed.raw?.publicKey).toHaveLength(32)
    expect(x.publicJwk.crv).toBe('X25519')
    expect(bytesToHex(ed.spkiDer)).not.toBe(bytesToHex(x.spkiDer))
  })
})
