import CryptoJS from 'crypto-js'

export const hashAlgorithms = ['MD5', 'SHA1', 'SHA256', 'SHA512', 'SHA3', 'RIPEMD160'] as const

export type HashAlgorithm = (typeof hashAlgorithms)[number]

const algorithmFunctions: Record<HashAlgorithm, (input: string) => string> = {
  MD5: (input) => CryptoJS.MD5(input).toString(CryptoJS.enc.Hex),
  SHA1: (input) => CryptoJS.SHA1(input).toString(CryptoJS.enc.Hex),
  SHA256: (input) => CryptoJS.SHA256(input).toString(CryptoJS.enc.Hex),
  SHA512: (input) => CryptoJS.SHA512(input).toString(CryptoJS.enc.Hex),
  SHA3: (input) => CryptoJS.SHA3(input).toString(CryptoJS.enc.Hex),
  RIPEMD160: (input) => CryptoJS.RIPEMD160(input).toString(CryptoJS.enc.Hex),
}

/** 计算指定算法的十六进制哈希 */
export function hashText(algorithm: HashAlgorithm, input: string): string {
  return algorithmFunctions[algorithm](input)
}

/** 一次计算全部算法，键为算法名 */
export function hashTextAll(input: string): Record<HashAlgorithm, string> {
  return Object.fromEntries(hashAlgorithms.map((algorithm) => [algorithm, hashText(algorithm, input)])) as Record<
    HashAlgorithm,
    string
  >
}
