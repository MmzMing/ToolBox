const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

function buildChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  for (let i = 0; i < 4; i++) {
    out[4 + i] = type.charCodeAt(i)
  }
  out.set(data, 8)
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
  return out
}

export function isPng(bytes: Uint8Array): boolean {
  return (
    bytes.length > 33 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  )
}

/**
 * 把键值对以 iTXt（UTF-8）chunk 插到 IHDR 之后，图片脱离本站仍可溯源。
 * 非 PNG 或空 entries 原样返回，调用方可无条件调用。
 */
export function insertPngTextChunks(
  bytes: Uint8Array,
  entries: ReadonlyArray<readonly [string, string]>,
): Uint8Array<ArrayBuffer> {
  if (!isPng(bytes) || !entries.length) {
    return bytes as Uint8Array<ArrayBuffer>
  }
  const chunks = entries.map(([keyword, text]) => {
    const key = keyword.slice(0, 79)
    const keyBytes = new TextEncoder().encode(key)
    const textBytes = new TextEncoder().encode(text)
    // keyword + NUL + compression flag + method + language BCP47(empty) + translated keyword(empty)
    const data = new Uint8Array(keyBytes.length + 5 + textBytes.length)
    data.set(keyBytes, 0)
    data.set(textBytes, keyBytes.length + 5)
    return buildChunk('iTXt', data)
  })
  const extra = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const insertAt = 33
  const out = new Uint8Array(bytes.length + extra)
  out.set(bytes.subarray(0, insertAt), 0)
  let offset = insertAt
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  out.set(bytes.subarray(insertAt), offset)
  return out
}
