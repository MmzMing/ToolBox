import {
  Asn1Tag,
  derBitStringBytes,
  derChild,
  derExpectTag,
  derIntegerMagnitude,
  derObjectIdentifierText,
  parseDer,
} from '@/utils/asn1'

export interface RsaPrivateComponents {
  n: Uint8Array
  e: Uint8Array
  d: Uint8Array
  iqmp: Uint8Array
  p: Uint8Array
  q: Uint8Array
}

export interface EcPrivateComponents {
  curveOid: string
  d: Uint8Array
  /** SEC1 [1] BIT STRING 里的未压缩点（首字节 0x04） */
  point: Uint8Array
}

export const KEY_ALGORITHM_OID = {
  rsaEncryption: '1.2.840.113549.1.1.1',
  ecPublicKey: '1.2.840.10045.2.1',
  ed25519: '1.3.101.112',
  x25519: '1.3.101.110',
} as const

interface UnwrappedKeyInfo {
  algorithmOid: string
  parametersOid?: string
  /** PKCS#1 RSAPrivateKey 或 SEC1 ECPrivateKey 的裸 DER */
  innerDer: Uint8Array
}

/** PKCS#8 剥壳：内部 OCTET STRING 装的正是 PKCS#1 / SEC1 的完整 DER，传统 PEM 直接换 label 即可 */
export function unwrapPrivateKeyInfo(pkcs8Der: Uint8Array): UnwrappedKeyInfo {
  const info = parseDer(pkcs8Der)
  derExpectTag(
    derChild(info, 0, 'PrivateKeyInfo version'),
    Asn1Tag.integer,
    'PrivateKeyInfo version',
  )
  const algorithm = derExpectTag(
    derChild(info, 1, 'PrivateKeyInfo algorithm'),
    Asn1Tag.sequence,
    'AlgorithmIdentifier',
  )
  const privateKey = derExpectTag(
    derChild(info, 2, 'PrivateKeyInfo privateKey'),
    Asn1Tag.octetString,
    'PrivateKeyInfo privateKey',
  )
  // RSA 的 AlgorithmIdentifier 第二个成员是 NULL，只有 EC 才是曲线 OID
  const parameters = algorithm.children[1]
  return {
    algorithmOid: derObjectIdentifierText(derChild(algorithm, 0, 'AlgorithmIdentifier algorithm')),
    parametersOid:
      parameters?.tag === Asn1Tag.objectIdentifier
        ? derObjectIdentifierText(parameters)
        : undefined,
    innerDer: privateKey.content,
  }
}

function readIntegerMember(
  parent: ReturnType<typeof parseDer>,
  index: number,
  context: string,
): Uint8Array {
  const element = derChild(parent, index, context)
  return derIntegerMagnitude(derExpectTag(element, Asn1Tag.integer, context))
}

/** PKCS#1 RSAPrivateKey 顺序：version, n, e, d, p, q, exponent1, exponent2, coefficient(iqmp) */
export function readRsaPrivateComponents(pkcs8Der: Uint8Array): RsaPrivateComponents {
  const { algorithmOid, innerDer } = unwrapPrivateKeyInfo(pkcs8Der)
  if (algorithmOid !== KEY_ALGORITHM_OID.rsaEncryption) {
    throw new Error(`Expected an RSA key, got algorithm OID ${algorithmOid}`)
  }
  const rsa = derExpectTag(parseDer(innerDer), Asn1Tag.sequence, 'RSAPrivateKey')
  const at = (index: number) => readIntegerMember(rsa, index, `RSAPrivateKey field #${index + 1}`)
  return { n: at(1), e: at(2), d: at(3), p: at(4), q: at(5), iqmp: at(8) }
}

/** SEC1 ECPrivateKey：version, privateKey, [0] parameters, [1] publicKey */
export function readEcPrivateComponents(pkcs8Der: Uint8Array): EcPrivateComponents {
  const { algorithmOid, parametersOid, innerDer } = unwrapPrivateKeyInfo(pkcs8Der)
  if (algorithmOid !== KEY_ALGORITHM_OID.ecPublicKey) {
    throw new Error(`Expected an EC key, got algorithm OID ${algorithmOid}`)
  }
  const ec = derExpectTag(parseDer(innerDer), Asn1Tag.sequence, 'ECPrivateKey')
  const publicKeyWrapper = ec.children.find((child) => child.tag === 0xa1)
  if (!parametersOid || !publicKeyWrapper) {
    throw new Error('EC private key is missing its curve or public point')
  }
  return {
    curveOid: parametersOid,
    // RFC 5915 的 privateKey 是 OCTET STRING（不是 INTEGER），直接取内容字节
    d: derExpectTag(
      derChild(ec, 1, 'ECPrivateKey privateKey'),
      Asn1Tag.octetString,
      'ECPrivateKey privateKey',
    ).content,
    point: derBitStringBytes(derChild(publicKeyWrapper, 0, 'ECPrivateKey publicKey')),
  }
}

/** Ed25519 / X25519 的 PKCS#8 里，私钥种子套了一层 OCTET STRING */
export function readCurve25519Seed(pkcs8Der: Uint8Array): {
  algorithmOid: string
  seed: Uint8Array
} {
  const { algorithmOid, innerDer } = unwrapPrivateKeyInfo(pkcs8Der)
  if (algorithmOid !== KEY_ALGORITHM_OID.ed25519 && algorithmOid !== KEY_ALGORITHM_OID.x25519) {
    throw new Error(`Expected an OKP key, got algorithm OID ${algorithmOid}`)
  }
  const wrapper = derExpectTag(parseDer(innerDer), Asn1Tag.octetString, 'OKP privateKey')
  return { algorithmOid, seed: wrapper.content }
}
