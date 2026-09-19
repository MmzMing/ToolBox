export const rsaKeySizes = [2048, 3072, 4096] as const

export type RsaKeySize = (typeof rsaKeySizes)[number]

export interface RsaKeyPairPems {
  publicKeyPem: string
  privateKeyPem: string
}

/** DER 字节 → PEM（Base64 按 64 字符换行 + BEGIN/END 包裹） */
function toPem(der: ArrayBuffer, label: string): string {
  const bytes = new Uint8Array(der)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  const base64 = btoa(binary).replace(/(.{64})/g, '$1\n')
  return `-----BEGIN ${label}-----\n${base64}\n-----END ${label}-----`
}

/** 用 WebCrypto 生成 RSA 密钥对并导出为 PEM（公钥 SPKI / 私钥 PKCS8），位数非法时抛出 Error */
export async function generateRsaKeyPair(bits: RsaKeySize): Promise<RsaKeyPairPems> {
  if (!rsaKeySizes.includes(bits)) {
    throw new Error(`Key size must be one of ${rsaKeySizes.join(', ')}`)
  }
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: bits,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['encrypt', 'decrypt'],
  )
  if (!('publicKey' in keyPair) || !('privateKey' in keyPair)) {
    throw new Error('Unexpected key pair generation result')
  }
  const [publicKeyDer, privateKeyDer] = await Promise.all([
    crypto.subtle.exportKey('spki', keyPair.publicKey),
    crypto.subtle.exportKey('pkcs8', keyPair.privateKey),
  ])
  return {
    publicKeyPem: toPem(publicKeyDer, 'PUBLIC KEY'),
    privateKeyPem: toPem(privateKeyDer, 'PRIVATE KEY'),
  }
}
