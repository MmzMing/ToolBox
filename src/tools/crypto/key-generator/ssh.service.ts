import type { CanonicalKey, EcCurve } from './keypair.service'

import { derIntegerContent } from '@/utils/asn1'
import { bytesToBase64 } from '@/utils/base64'
import { concatBytes } from '@/utils/bytes'
import { pemToDer, toPem } from '@/utils/pem'
import { randomBytes } from '@/utils/random'
import { readEcPrivateComponents, readRsaPrivateComponents } from './key-components.service'

/**
 * OpenSSH 私钥文件（PROTOCOL.key 的无口令变体）。实测最容易写错的三处：
 * pubkey 之后还有一个 uint32 privkeylen；RSA 私有段顺序是 n,e,d,iqmp,p,q（公钥 blob 却是 e,n）；
 * 填充长度可以为 0（ed25519 恰好 8 字节对齐时就不加）。
 */
const AUTH_MAGIC = 'openssh-key-v1\0'
const BLOCK_SIZE = 8
const PRIVATE_KEY_PEM_LABEL = 'OPENSSH PRIVATE KEY'
/** OpenSSH 自己的 PEM 用 70 列换行（openssl 用 64），保持与 ssh-keygen 产物逐字节一致 */
const OPENSSH_PEM_COLUMNS = 70

const ECDSA_CURVE_NAMES: Record<EcCurve, string> = {
  'P-256': 'nistp256',
  'P-384': 'nistp384',
  'P-521': 'nistp521',
}

const OID_TO_ECDSA_CURVE: Record<string, EcCurve> = {
  '1.2.840.10045.3.1.7': 'P-256',
  '1.3.132.0.34': 'P-384',
  '1.3.132.0.35': 'P-521',
}

export type SshKeyType = 'ssh-rsa' | 'ssh-ed25519' | `ecdsa-sha2-${string}`

/** 解析出的 OpenSSH 私钥外壳，只支持 cipher/kdf 均为 none 的无口令密钥 */
export interface SshPrivateKeyShell {
  keyType: string
  publicBlob: Uint8Array
  privateFields: Uint8Array
  comment: string
}

function uint32(value: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(4)
  new DataView(bytes.buffer).setUint32(0, value)
  return bytes
}

/** SSH 的 string = uint32 长度 + 字节；mpint 的编码规则与 DER INTEGER 内容一致，复用同一套归一化 */
function sshString(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return concatBytes(uint32(bytes.length), bytes)
}

function sshText(value: string): Uint8Array {
  return sshString(new TextEncoder().encode(value))
}

function sshMpint(magnitude: Uint8Array): Uint8Array {
  return sshString(derIntegerContent(magnitude))
}

/** X25519 只做密钥交换，OpenSSH 没有对应的单密钥类型 */
function rejectX25519(key: CanonicalKey): void {
  if (key.algorithm === 'x25519') {
    throw new Error('X25519 keys have no OpenSSH representation')
  }
}

function ecdsaCurve(key: CanonicalKey): EcCurve {
  const { curveOid } = readEcPrivateComponents(key.pkcs8Der)
  const curve = OID_TO_ECDSA_CURVE[curveOid]
  if (!curve) {
    throw new Error(`Unsupported EC curve OID ${curveOid}`)
  }
  return curve
}

export function sshKeyType(key: CanonicalKey): SshKeyType {
  rejectX25519(key)
  if (key.algorithm === 'rsa') return 'ssh-rsa'
  if (key.algorithm === 'ed25519') return 'ssh-ed25519'
  return `ecdsa-sha2-${ECDSA_CURVE_NAMES[ecdsaCurve(key)]}`
}

/** 公钥 blob：authorized_keys 行与指纹都基于它 */
export function sshPublicBlob(key: CanonicalKey): Uint8Array<ArrayBuffer> {
  const type = sshKeyType(key)
  if (type === 'ssh-ed25519') {
    if (!key.raw) throw new Error('Ed25519 key is missing its raw public bytes')
    return concatBytes(sshText(type), sshString(key.raw.publicKey))
  }
  if (type === 'ssh-rsa') {
    const { n, e } = readRsaPrivateComponents(key.pkcs8Der)
    return concatBytes(sshText(type), sshMpint(e), sshMpint(n))
  }
  const { point } = readEcPrivateComponents(key.pkcs8Der)
  return concatBytes(sshText(type), sshText(ECDSA_CURVE_NAMES[ecdsaCurve(key)]), sshString(point))
}

/** authorized_keys 里的一行：`ssh-ed25519 AAAA… comment` */
export function sshPublicKeyLine(key: CanonicalKey, comment: string): string {
  const line = `${sshKeyType(key)} ${bytesToBase64(sshPublicBlob(key))}`
  return comment ? `${line} ${comment}` : line
}

/** 私有段：check×2 + 密钥类型 + 各自分量（RSA 为 n,e,d,iqmp,p,q） */
function sshPrivateFields(key: CanonicalKey): Uint8Array<ArrayBuffer> {
  const type = sshKeyType(key)
  if (type === 'ssh-ed25519') {
    if (!key.raw) throw new Error('Ed25519 key is missing its raw bytes')
    // 私钥分量是 64 字节：seed ‖ public
    return concatBytes(
      sshText(type),
      sshString(key.raw.publicKey),
      sshString(concatBytes(key.raw.seed, key.raw.publicKey)),
    )
  }
  if (type === 'ssh-rsa') {
    const { n, e, d, iqmp, p, q } = readRsaPrivateComponents(key.pkcs8Der)
    return concatBytes(
      sshText(type),
      sshMpint(n),
      sshMpint(e),
      sshMpint(d),
      sshMpint(iqmp),
      sshMpint(p),
      sshMpint(q),
    )
  }
  const { d, point } = readEcPrivateComponents(key.pkcs8Der)
  return concatBytes(
    sshText(type),
    sshText(ECDSA_CURVE_NAMES[ecdsaCurve(key)]),
    sshString(point),
    sshMpint(d),
  )
}

/** 生成 `-----BEGIN OPENSSH PRIVATE KEY-----`（cipher/kdf 均为 none，即无口令）。
 * options.check 让测试能注入那对随机 uint32，从而对 ssh-keygen 真实产物做逐字节断言。 */
export function sshPrivateKeyFile(
  key: CanonicalKey,
  comment: string,
  options: { check?: Uint8Array } = {},
): string {
  rejectX25519(key)
  const check = options.check ?? randomBytes(4)
  const body = concatBytes(check, check, sshPrivateFields(key), sshText(comment))
  const paddingLength = (BLOCK_SIZE - (body.length % BLOCK_SIZE)) % BLOCK_SIZE
  const padding = new Uint8Array(Array.from({ length: paddingLength }, (_, index) => index + 1))
  const privateSection = concatBytes(body, padding)
  return toPem(
    PRIVATE_KEY_PEM_LABEL,
    concatBytes(
      new TextEncoder().encode(AUTH_MAGIC),
      sshText('none'),
      sshText('none'),
      sshString(new Uint8Array(0)),
      uint32(1),
      sshString(sshPublicBlob(key)),
      uint32(privateSection.length),
      privateSection,
    ),
    OPENSSH_PEM_COLUMNS,
  )
}

/** 反向：读外壳（供导入 Tab 使用）。口令加密的密钥会被明确拒绝 */
export function readSshPrivateKey(text: string): SshPrivateKeyShell {
  const { der } = pemToDer(text, [PRIVATE_KEY_PEM_LABEL])
  if (new TextDecoder().decode(der.subarray(0, AUTH_MAGIC.length)) !== AUTH_MAGIC) {
    throw new Error('Not an OpenSSH private key: wrong auth magic')
  }
  const view = new DataView(der.buffer, der.byteOffset, der.byteLength)
  let offset = AUTH_MAGIC.length
  const readString = (): Uint8Array => {
    const length = view.getUint32(offset)
    offset += 4
    const value = new Uint8Array(der.subarray(offset, offset + length))
    offset += length
    return value
  }
  const cipher = new TextDecoder().decode(readString())
  const kdf = new TextDecoder().decode(readString())
  readString()
  if (cipher !== 'none' || kdf !== 'none') {
    throw new Error(
      `Passphrase-protected OpenSSH keys are not supported (cipher=${cipher}, kdf=${kdf})`,
    )
  }
  if (view.getUint32(offset) !== 1) {
    throw new Error('OpenSSH keys with multiple key entries are not supported')
  }
  offset += 4
  const publicBlob = readString()
  const privateSectionLength = view.getUint32(offset)
  offset += 4
  const sectionEnd = offset + privateSectionLength
  if (sectionEnd !== der.length) {
    throw new Error('OpenSSH private section length does not match the remaining bytes')
  }
  const check = der.subarray(offset, offset + 8)
  if (check[0] !== check[4] || check[3] !== check[7]) {
    throw new Error('OpenSSH check bytes do not match: the key is corrupted')
  }
  offset += 8
  const keyType = new TextDecoder().decode(readString())
  // comment 前面是固定数量的分量字段，只能按类型正向跳过——从尾部倒推会把注释读成一坨字节
  const fieldCount = sshPrivateFieldCount(keyType)
  const fieldsStart = offset
  for (let index = 0; index < fieldCount; index++) {
    readString()
  }
  const privateFields = der.subarray(fieldsStart, offset)
  const comment = new TextDecoder().decode(readString())
  const padding = der.subarray(offset, sectionEnd)
  if (padding.length > 7 || padding.some((byte, index) => byte !== index + 1)) {
    throw new Error('OpenSSH private key has malformed padding')
  }
  return { keyType, publicBlob, privateFields, comment }
}

/** 各密钥类型在 comment 之前的字段数（RSA 为 n,e,d,iqmp,p,q） */
function sshPrivateFieldCount(keyType: string): number {
  if (keyType === 'ssh-rsa') return 6
  if (keyType === 'ssh-ed25519') return 2
  if (keyType.startsWith('ecdsa-sha2-')) return 3
  throw new Error(`Unsupported OpenSSH key type "${keyType}"`)
}
