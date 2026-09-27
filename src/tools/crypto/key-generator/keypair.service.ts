import { bytesToBase64Url } from '@/utils/base64'
import { randomBytes } from '@/utils/random'
import {
  derBitString,
  derInteger,
  derObjectIdentifier,
  derOctetString,
  derSequence,
} from '@/utils/asn1'
import { ed25519, x25519 } from '@noble/curves/ed25519.js'

export const KEY_ALGORITHMS = ['rsa', 'ecdsa', 'ed25519', 'x25519'] as const
export type KeyAlgorithm = (typeof KEY_ALGORITHMS)[number]

export const RSA_KEY_SIZES = [2048, 3072, 4096] as const
export type RsaKeySize = (typeof RSA_KEY_SIZES)[number]

export const EC_CURVES = ['P-256', 'P-384', 'P-521'] as const
export type EcCurve = (typeof EC_CURVES)[number]

export interface KeyPairRequest {
  algorithm: KeyAlgorithm
  bits?: RsaKeySize
  curve?: EcCurve
}

/**
 * 密钥的规范中间表示：所有输出格式都只从这份字节派生，
 * 保证同一把密钥在 PEM / SSH / JWK 三种视图下互为同一个对象。
 */
export interface CanonicalKey {
  algorithm: KeyAlgorithm
  bits?: number
  curve?: EcCurve
  pkcs8Der: Uint8Array
  spkiDer: Uint8Array
  privateJwk: JsonWebKey
  publicJwk: JsonWebKey
  /** Ed25519 / X25519 的 32 字节种子与公钥，SSH 私有段与 JWK 都需要 */
  raw?: { seed: Uint8Array; publicKey: Uint8Array }
}

const OID = {
  ed25519: '1.3.101.112',
  x25519: '1.3.101.110',
} as const

/** RSA 与 ECDSA 走 WebCrypto：原生实现，4096 位实测约 190ms，纯 JS 无法比拟 */
async function generateAsymmetric(request: KeyPairRequest): Promise<CanonicalKey> {
  const keyPair =
    request.algorithm === 'rsa'
      ? await crypto.subtle.generateKey(
          {
            name: 'RSASSA-PKCS1-v1_5',
            modulusLength: request.bits ?? 2048,
            publicExponent: new Uint8Array([1, 0, 1]),
            hash: 'SHA-256',
          },
          true,
          ['sign', 'verify'],
        )
      : await crypto.subtle.generateKey(
          { name: 'ECDSA', namedCurve: request.curve ?? 'P-256' },
          true,
          ['sign', 'verify'],
        )
  if (!('privateKey' in keyPair)) {
    throw new Error('Key generation did not return a key pair')
  }
  const [pkcs8Der, spkiDer, privateJwk, publicJwk] = await Promise.all([
    crypto.subtle.exportKey('pkcs8', keyPair.privateKey),
    crypto.subtle.exportKey('spki', keyPair.publicKey),
    crypto.subtle.exportKey('jwk', keyPair.privateKey),
    crypto.subtle.exportKey('jwk', keyPair.publicKey),
  ])
  return {
    algorithm: request.algorithm,
    bits: request.bits,
    curve: request.algorithm === 'ecdsa' ? (request.curve ?? 'P-256') : undefined,
    pkcs8Der: new Uint8Array(pkcs8Der),
    spkiDer: new Uint8Array(spkiDer),
    privateJwk: stripJwkMetadata(privateJwk),
    publicJwk: stripJwkMetadata(publicJwk),
  }
}

/**
 * Ed25519 / X25519 走 noble：与 WebCrypto 同种子逐字节一致（已实测），
 * 却能覆盖 Chrome 137 / Safari 17 之前的老浏览器，省掉一套特性检测分支。
 * 种子由调用方传入，所以同一把密钥的全部输出格式都是确定性的（测试据此锁死 RFC 8410 向量）。
 */
export function curve25519KeyFromSeed(
  algorithm: 'ed25519' | 'x25519',
  seed: Uint8Array,
): CanonicalKey {
  const isEd25519 = algorithm === 'ed25519'
  if (seed.length !== 32) {
    throw new Error(`Ed25519/X25519 seed must be 32 bytes, got ${seed.length}`)
  }
  const publicKey = isEd25519 ? ed25519.getPublicKey(seed) : x25519.getPublicKey(seed)
  const oid = isEd25519 ? OID.ed25519 : OID.x25519
  // RFC 8410 §10 的 PKCS#8 / SPKI 形状：算法标识无参数，私钥是套了一层 OCTET STRING 的种子
  const pkcs8Der = derSequence(
    derInteger(new Uint8Array([0])),
    derSequence(derObjectIdentifier(oid)),
    derOctetString(derOctetString(seed)),
  )
  const spkiDer = derSequence(derSequence(derObjectIdentifier(oid)), derBitString(publicKey))
  const base = { kty: 'OKP', crv: isEd25519 ? 'Ed25519' : 'X25519' }
  return {
    algorithm,
    pkcs8Der,
    spkiDer,
    privateJwk: { ...base, d: bytesToBase64Url(seed), x: bytesToBase64Url(publicKey) },
    publicJwk: { ...base, x: bytesToBase64Url(publicKey) },
    raw: { seed, publicKey },
  }
}

/** 校验参数并生成密钥对；非法位数或曲线抛出英文技术信息，由 UI 层负责翻译 */
export async function generateKeyPair(request: KeyPairRequest): Promise<CanonicalKey> {
  if (request.algorithm === 'rsa') {
    const bits = request.bits ?? 2048
    if (!RSA_KEY_SIZES.includes(bits)) {
      throw new Error(`Key size must be one of ${RSA_KEY_SIZES.join(', ')}`)
    }
    return generateAsymmetric({ ...request, bits })
  }
  if (request.algorithm === 'ecdsa') {
    const curve = request.curve ?? 'P-256'
    if (!EC_CURVES.includes(curve)) {
      throw new Error(`Curve must be one of ${EC_CURVES.join(', ')}`)
    }
    return generateAsymmetric({ ...request, curve })
  }
  if (request.algorithm === 'ed25519' || request.algorithm === 'x25519') {
    return curve25519KeyFromSeed(request.algorithm, randomBytes(32))
  }
  throw new Error(`Unsupported key algorithm "${request.algorithm}"`)
}

/** key_ops / ext 是 WebCrypto 的会话信息，不属于可移植 JWK */
function stripJwkMetadata(jwk: JsonWebKey): JsonWebKey {
  const copy: JsonWebKey = { ...jwk }
  delete copy.key_ops
  delete copy.ext
  return copy
}
