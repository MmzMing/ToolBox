import type { CanonicalKey } from './keypair.service'

import { bytesToBase64, bytesToBase64Url } from '@/utils/base64'
import { bytesToHex } from '@/utils/bytes'
import { toPem } from '@/utils/pem'
import {
  readEcPrivateComponents,
  readRsaPrivateComponents,
  unwrapPrivateKeyInfo,
} from './key-components.service'
import { sshFingerprint } from './fingerprint.service'
import { sshPublicKeyLine, sshPublicBlob, sshPrivateKeyFile } from './ssh.service'

export const KEY_FORMAT_IDS = [
  'pkcs8-pem',
  'traditional-pem',
  'spki-pem',
  'ssh-public',
  'ssh-private',
  'jwk-private',
  'jwk-public',
  'jwks',
  'pkcs8-der',
  'spki-der',
  'public-raw-hex',
  'public-raw-base64',
  'public-raw-base64url',
  'private-raw-hex',
  'fingerprint-sha256',
  'fingerprint-md5',
] as const

export type KeyFormatId = (typeof KEY_FORMAT_IDS)[number]
export type KeyFormatRole = 'private' | 'public'
export type KeyFormatReason = 'no-ssh' | 'no-traditional-pem' | 'no-raw-seed'

export interface KeyFormatOutput {
  id: KeyFormatId
  role: KeyFormatRole
  text: string
}

export interface KeyFormats {
  outputs: KeyFormatOutput[]
  unavailable: { id: KeyFormatId; reason: KeyFormatReason }[]
}

export interface KeyFormatOptions {
  /** SSH 公钥行与私钥文件里的注释，通常是邮箱或用途 */
  comment: string
  /** JWKS 的 key id，JWT 签发方要靠它轮换密钥 */
  kid: string
}

const TRADITIONAL_LABELS: Record<'rsa' | 'ecdsa', string> = {
  rsa: 'RSA PRIVATE KEY',
  ecdsa: 'EC PRIVATE KEY',
}

/** JWA 注册名：WebCrypto 给的 alg 是按 hash 推的，输出必须按算法族归一（Ed25519 → EdDSA） */
function jwaAlg(key: CanonicalKey): string {
  if (key.algorithm === 'rsa') return 'RS256'
  if (key.algorithm === 'ed25519') return 'EdDSA'
  if (key.algorithm === 'x25519') return 'ECDH-ES'
  return { 'P-256': 'ES256', 'P-384': 'ES384', 'P-521': 'ES512' }[key.curve ?? 'P-256']
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

/** TS 的 JsonWebKey 没有 kid 成员，且输出只要可序列化，用普通记录做增删 */
type JwkMembers = Record<string, unknown>

/** 私钥 JWK 不该声明用途与算法，那些属于公钥 / JWKS 那一行 */
function privateJwk(key: CanonicalKey): JwkMembers {
  const members: JwkMembers = { ...key.privateJwk }
  for (const name of ['alg', 'use', 'kid'] as const) {
    delete members[name]
  }
  return members
}

function publicJwk(key: CanonicalKey, options: KeyFormatOptions): JwkMembers {
  return {
    ...key.publicJwk,
    alg: jwaAlg(key),
    use: key.algorithm === 'x25519' ? 'enc' : 'sig',
    kid: options.kid,
  }
}

/** 公钥的「原始」表示：EC 是未压缩点，RSA 是模数，OKP 是 32 字节公钥 */
function publicRawBytes(key: CanonicalKey): Uint8Array {
  if (key.raw) return key.raw.publicKey
  if (key.algorithm === 'ecdsa') return readEcPrivateComponents(key.pkcs8Der).point
  return readRsaPrivateComponents(key.pkcs8Der).n
}

/** 渲染 §4 格式矩阵的全部行；不适用的格式带原因返回，UI 据此置灰而不是静默省略 */
export async function renderKeyFormats(
  key: CanonicalKey,
  options: KeyFormatOptions,
): Promise<KeyFormats> {
  const raw = publicRawBytes(key)
  const outputs: KeyFormatOutput[] = [
    { id: 'pkcs8-pem', role: 'private', text: toPem('PRIVATE KEY', key.pkcs8Der) },
    { id: 'spki-pem', role: 'public', text: toPem('PUBLIC KEY', key.spkiDer) },
    { id: 'jwk-private', role: 'private', text: json(privateJwk(key)) },
    { id: 'jwk-public', role: 'public', text: json(publicJwk(key, options)) },
    { id: 'jwks', role: 'public', text: json({ keys: [publicJwk(key, options)] }) },
    { id: 'pkcs8-der', role: 'private', text: bytesToBase64(key.pkcs8Der) },
    { id: 'spki-der', role: 'public', text: bytesToBase64(key.spkiDer) },
    { id: 'public-raw-hex', role: 'public', text: bytesToHex(raw) },
    { id: 'public-raw-base64', role: 'public', text: bytesToBase64(raw) },
    { id: 'public-raw-base64url', role: 'public', text: bytesToBase64Url(raw) },
  ]
  const unavailable: { id: KeyFormatId; reason: KeyFormatReason }[] = []

  if (key.algorithm === 'rsa' || key.algorithm === 'ecdsa') {
    outputs.splice(1, 0, {
      id: 'traditional-pem',
      role: 'private',
      // PKCS#8 内部装的就是 PKCS#1 / SEC1 的完整 DER，剥壳换 label 即可
      text: toPem(TRADITIONAL_LABELS[key.algorithm], unwrapPrivateKeyInfo(key.pkcs8Der).innerDer),
    })
  } else {
    unavailable.push({ id: 'traditional-pem', reason: 'no-traditional-pem' })
  }

  if (key.raw) {
    outputs.push({ id: 'private-raw-hex', role: 'private', text: bytesToHex(key.raw.seed) })
  } else {
    unavailable.push({ id: 'private-raw-hex', reason: 'no-raw-seed' })
  }

  if (key.algorithm === 'x25519') {
    for (const id of [
      'ssh-public',
      'ssh-private',
      'fingerprint-sha256',
      'fingerprint-md5',
    ] as const) {
      unavailable.push({ id, reason: 'no-ssh' })
    }
    return { outputs, unavailable }
  }

  const blob = sshPublicBlob(key)
  outputs.push(
    { id: 'ssh-public', role: 'public', text: sshPublicKeyLine(key, options.comment) },
    { id: 'ssh-private', role: 'private', text: sshPrivateKeyFile(key, options.comment) },
    { id: 'fingerprint-sha256', role: 'public', text: await sshFingerprint(blob, 'SHA256') },
    { id: 'fingerprint-md5', role: 'public', text: await sshFingerprint(blob, 'MD5') },
  )
  return { outputs, unavailable }
}
