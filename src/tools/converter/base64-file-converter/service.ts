export interface DataUrlParts {
  mime: string
  base64: string
  bytes: Uint8Array<ArrayBuffer>
}

/** 常见 MIME → 扩展名（下载时的默认文件名后缀） */
const MIME_EXTENSIONS: Record<string, string> = {
  'application/json': 'json',
  'application/octet-stream': 'bin',
  'application/pdf': 'pdf',
  'application/zip': 'zip',
  'image/bmp': 'bmp',
  'image/gif': 'gif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/svg+xml': 'svg',
  'image/webp': 'webp',
  'text/css': 'css',
  'text/csv': 'csv',
  'text/html': 'html',
  'text/plain': 'txt',
}

const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

/** Data URL → 结构化部分；非法输入抛 Error */
export function parseDataUrl(dataUrl: string): DataUrlParts {
  const match = /^data:([^,]*),([\s\S]*)$/.exec(dataUrl.trim())
  if (!match) {
    throw new Error('Invalid Data URL: missing "data:" prefix or comma separator')
  }
  const segments = match[1].split(';')
  if (!segments.includes('base64')) {
    throw new Error('Invalid Data URL: only base64 encoding is supported')
  }
  const mime = segments.find((segment) => segment !== '' && segment !== 'base64') ?? 'text/plain'
  const base64 = match[2].replaceAll(/\s/g, '')
  if (!BASE64_PATTERN.test(base64)) {
    throw new Error('Invalid Data URL: malformed base64 payload')
  }
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return { mime, base64, bytes }
}

/** 字节 → Data URL（mime 为空时按 text/plain 处理） */
export function buildDataUrl(mime: string, bytes: Uint8Array): string {
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return `data:${mime || 'text/plain'};base64,${btoa(binary)}`
}

/** 文件 → Base64 Data URL（UTF-8 字节安全） */
export async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  return buildDataUrl(file.type || 'application/octet-stream', new Uint8Array(buffer))
}

/** Data URL → File；非法 Data URL 抛 Error */
export function base64ToFile(dataUrl: string, filename: string): File {
  const { mime, bytes } = parseDataUrl(dataUrl)
  return new File([bytes], filename, { type: mime })
}

/** 提取 Data URL 中 ;name= 参数指定的文件名（无则返回 null） */
export function parseDataUrlName(dataUrl: string): string | null {
  const meta = /^data:([^,]*)/.exec(dataUrl.trim())?.[1] ?? ''
  const match = /(?:^|;)name=([^;]*)/.exec(meta)
  if (!match) {
    return null
  }
  try {
    return decodeURIComponent(match[1])
  } catch {
    return match[1]
  }
}

/** 由 Data URL 猜测下载文件名（name 参数 → mime 扩展名 → download.bin） */
export function guessFileName(dataUrl: string): string {
  const name = parseDataUrlName(dataUrl)
  if (name) {
    return name
  }
  const { mime } = parseDataUrl(dataUrl)
  return `download.${MIME_EXTENSIONS[mime] ?? 'bin'}`
}

/** 字节数 → 可读大小（如 1.5 KB） */
export function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = Number.isFinite(bytes) ? Math.max(0, bytes) : 0
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${unit === 0 ? value : value.toFixed(1)} ${units[unit]}`
}
