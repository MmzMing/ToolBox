/** 密码学安全随机字节，全站唯一的熵源入口（禁止 Math.random） */
export function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  if (!Number.isInteger(length) || length <= 0) {
    throw new Error(`randomBytes: length must be a positive integer, got ${length}`)
  }
  const bytes = new Uint8Array(length)
  // getRandomValues 单次最多 65536 字节，超长密钥分块填充
  for (let offset = 0; offset < length; offset += 0x10000) {
    crypto.getRandomValues(bytes.subarray(offset, Math.min(offset + 0x10000, length)))
  }
  return bytes
}

/** 基于 crypto.getRandomValues 的无模偏差均匀随机整数，范围 [0, max) */
export function randomInt(max: number): number {
  const limit = Math.floor(0x100000000 / max) * max
  const buffer = new Uint32Array(1)
  let value: number
  do {
    crypto.getRandomValues(buffer)
    value = buffer[0]
  } while (value >= limit)
  return value % max
}

/** Fisher-Yates 洗牌，返回新数组且不修改入参，随机源为无偏 randomInt */
export function shuffle<T>(items: readonly T[]): T[] {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index--) {
    const swap = randomInt(index + 1)
    const current = result[index]
    result[index] = result[swap]
    result[swap] = current
  }
  return result
}
