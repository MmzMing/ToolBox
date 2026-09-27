import { describe, expect, it } from 'vitest'

import {
  Asn1Tag,
  derBitString,
  derBitStringBytes,
  derChild,
  derContextConstructed,
  derExpectTag,
  derInteger,
  derIntegerContent,
  derIntegerMagnitude,
  derNull,
  derObjectIdentifier,
  derObjectIdentifierText,
  derOctetString,
  derSequence,
  derTlv,
  parseDer,
} from '@/utils/asn1'
import { bytesToHex, concatBytes, hexToBytes } from '@/utils/bytes'

/** RFC 8410 §10 的确定性密钥材料：用它锁死编码结果，不用随机密钥 */
const ED25519_SEED = hexToBytes('9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60')
const ED25519_PUBLIC = hexToBytes(
  'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a',
)
/** openssl 3.5 / WebCrypto 实测导出的 P-256 PKCS#8，含 0x81 长长度域 */
const EC_P256_PKCS8 =
  '308187020100301306072a8648ce3d020106082a8648ce3d030107046d306b0201010420913274b3d7e67d7801c7fa1dad5e' +
  '4ddeb71d7335f872ff9c7cf3471f40562730a14403420004959051f4d0b408ee8b691787d0c2104aec53dea408612cfe35f3' +
  '25bd5dd0c2b6cb7705a59291e68739df468b4ded67af47ef8dd9e1f3167e421d4897fab7c780'

describe('DER 编码', () => {
  it('reproduces the RFC 8410 Ed25519 PKCS#8 vector', () => {
    const pkcs8 = derSequence(
      derInteger(hexToBytes('00')),
      derSequence(derObjectIdentifier('1.3.101.112')),
      derOctetString(derOctetString(ED25519_SEED)),
    )
    expect(bytesToHex(pkcs8)).toBe(`302e020100300506032b657004220420${bytesToHex(ED25519_SEED)}`)
  })

  it('reproduces the RFC 8410 Ed25519 SubjectPublicKeyInfo vector', () => {
    const spki = derSequence(
      derSequence(derObjectIdentifier('1.3.101.112')),
      derBitString(ED25519_PUBLIC),
    )
    expect(bytesToHex(spki)).toBe(`302a300506032b6570032100${bytesToHex(ED25519_PUBLIC)}`)
  })

  it('encodes the X25519 OID one arc away from Ed25519', () => {
    expect(bytesToHex(derObjectIdentifier('1.3.101.110'))).toBe('06032b656e')
    expect(bytesToHex(derObjectIdentifier('1.2.840.113549.1.1.1'))).toBe('06092a864886f70d010101')
    expect(bytesToHex(derObjectIdentifier('2.999'))).toBe('06028837')
  })

  it('pads positive integers with a sign byte and drops redundant leading zeros', () => {
    expect(bytesToHex(derIntegerContent(hexToBytes('81')))).toBe('0081')
    expect(bytesToHex(derIntegerContent(hexToBytes('000081')))).toBe('0081')
    expect(bytesToHex(derIntegerContent(hexToBytes('7f')))).toBe('7f')
    expect(bytesToHex(derIntegerContent(hexToBytes('00')))).toBe('00')
  })

  it('uses short length form below 0x80 and long form at or above it', () => {
    expect(bytesToHex(derTlv(Asn1Tag.octetString, new Uint8Array(127)).subarray(0, 2))).toBe('047f')
    expect(bytesToHex(derTlv(Asn1Tag.octetString, new Uint8Array(128)).subarray(0, 3))).toBe(
      '048180',
    )
    expect(bytesToHex(derTlv(Asn1Tag.octetString, new Uint8Array(70_000)).subarray(0, 5))).toBe(
      '0483011170',
    )
  })

  it('wraps a BIT STRING with zero unused bits and NULL as 05 00', () => {
    expect(bytesToHex(derBitString(hexToBytes('ff')))).toBe('030200ff')
    expect(bytesToHex(derNull())).toBe('0500')
    expect(bytesToHex(derContextConstructed(1, derBitString(hexToBytes('04'))))).toBe(
      'a10403020004',
    )
  })
})

describe('DER 解析', () => {
  it('walks the Ed25519 PKCS#8 structure back to the seed', () => {
    const pkcs8 = parseDer(
      hexToBytes(`302e020100300506032b657004220420${bytesToHex(ED25519_SEED)}`),
    )
    expect(pkcs8.children).toHaveLength(3)
    expect(derIntegerMagnitude(derChild(pkcs8, 0, 'PrivateKeyInfo version'))).toEqual(
      hexToBytes('00'),
    )
    const algorithm = derChild(pkcs8, 1, 'PrivateKeyInfo algorithm')
    expect(derObjectIdentifierText(derChild(algorithm, 0, 'AlgorithmIdentifier'))).toBe(
      '1.3.101.112',
    )
    const wrapper = derExpectTag(
      derChild(pkcs8, 2, 'PrivateKeyInfo privateKey'),
      Asn1Tag.octetString,
      'pkcs8',
    )
    expect(
      derExpectTag(parseDer(wrapper.content), Asn1Tag.octetString, 'ed25519 privateKey').content,
    ).toEqual(ED25519_SEED)
  })

  it('unwraps a real EC P-256 PKCS#8 down to the SEC1 key and public point', () => {
    const pkcs8 = parseDer(hexToBytes(EC_P256_PKCS8))
    const algorithm = derChild(pkcs8, 1, 'PrivateKeyInfo algorithm')
    expect(derObjectIdentifierText(derChild(algorithm, 0, 'ec algorithm'))).toBe(
      '1.2.840.10045.2.1',
    )
    expect(derObjectIdentifierText(derChild(algorithm, 1, 'ec curve'))).toBe('1.2.840.10045.3.1.7')

    const sec1 = parseDer(derChild(pkcs8, 2, 'PrivateKeyInfo privateKey').content)
    expect(derIntegerMagnitude(derChild(sec1, 0, 'ECPrivateKey version'))).toEqual(hexToBytes('01'))
    expect(derChild(sec1, 1, 'ECPrivateKey privateKey').content).toHaveLength(32)
    const point = derBitStringBytes(
      derChild(derChild(sec1, 2, 'ECPrivateKey publicKey'), 0, 'publicKey bit string'),
    )
    expect(point[0]).toBe(0x04)
    expect(point).toHaveLength(65)
  })

  it('round-trips OID text through encode and parse', () => {
    for (const oid of ['1.2.840.113549.1.1.1', '1.3.101.112', '2.999', '1.2.840.10045.3.1.7']) {
      expect(derObjectIdentifierText(parseDer(derObjectIdentifier(oid)))).toBe(oid)
    }
  })

  it('rejects BER constructs, truncation and trailing garbage', () => {
    expect(() => parseDer(new Uint8Array([]))).toThrowError(/unexpected end of buffer/)
    expect(() => parseDer(new Uint8Array([0x30, 0x80, 0x00, 0x00]))).toThrowError(
      /indefinite length/,
    )
    expect(() =>
      parseDer(new Uint8Array([0x30, 0x81, 0x05, 0x00, 0x00, 0x00, 0x00, 0x00])),
    ).toThrowError(/non-minimal/)
    expect(() => parseDer(new Uint8Array([0x04, 0x10, 0x01, 0x02]))).toThrowError(
      /truncated at offset 2/,
    )
    expect(() => parseDer(concatBytes(derNull(), derNull()))).toThrowError(/trailing bytes/)
  })

  it('reports which tag or child was missing instead of returning undefined', () => {
    expect(() => derChild(parseDer(derNull()), 3, 'stub')).toThrowError(/stub is missing child #4/)
    expect(() => derExpectTag(parseDer(derNull()), Asn1Tag.sequence, 'privateKey')).toThrowError(
      /expected tag 0x30, got 0x05/,
    )
    expect(() =>
      derBitStringBytes({ tag: Asn1Tag.bitString, content: new Uint8Array([1, 0]), children: [] }),
    ).toThrowError(/unused bits/)
  })

  it('validates OID arcs before encoding', () => {
    expect(() => derObjectIdentifier('3.0')).toThrowError(/out of range/)
    expect(() => derObjectIdentifier('1.40')).toThrowError(/out of range/)
    expect(() => derObjectIdentifier('1')).toThrowError(/at least two arcs/)
    expect(() => derObjectIdentifier('1.x')).toThrowError(/invalid OID arc/)
  })
})
