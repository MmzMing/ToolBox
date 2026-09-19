import { extension as mimeExtension, lookup as mimeLookup } from 'mime-types'

export interface MimeMapping {
  extension: string
  mime: string
}

/** 常见扩展名与 MIME 映射表（展示用 + mime-types 库的兜底） */
export const commonMimeTypes: readonly MimeMapping[] = [
  { extension: 'txt', mime: 'text/plain' },
  { extension: 'html', mime: 'text/html' },
  { extension: 'css', mime: 'text/css' },
  { extension: 'csv', mime: 'text/csv' },
  { extension: 'md', mime: 'text/markdown' },
  { extension: 'js', mime: 'text/javascript' },
  { extension: 'json', mime: 'application/json' },
  { extension: 'xml', mime: 'application/xml' },
  { extension: 'yaml', mime: 'text/yaml' },
  { extension: 'pdf', mime: 'application/pdf' },
  { extension: 'zip', mime: 'application/zip' },
  { extension: 'gz', mime: 'application/gzip' },
  { extension: 'tar', mime: 'application/x-tar' },
  { extension: 'bin', mime: 'application/octet-stream' },
  { extension: 'wasm', mime: 'application/wasm' },
  { extension: 'png', mime: 'image/png' },
  { extension: 'jpg', mime: 'image/jpeg' },
  { extension: 'jpeg', mime: 'image/jpeg' },
  { extension: 'gif', mime: 'image/gif' },
  { extension: 'svg', mime: 'image/svg+xml' },
  { extension: 'webp', mime: 'image/webp' },
  { extension: 'ico', mime: 'image/vnd.microsoft.icon' },
  { extension: 'mp3', mime: 'audio/mpeg' },
  { extension: 'wav', mime: 'audio/wav' },
  { extension: 'ogg', mime: 'audio/ogg' },
  { extension: 'mp4', mime: 'video/mp4' },
  { extension: 'webm', mime: 'video/webm' },
  { extension: 'avi', mime: 'video/x-msvideo' },
  { extension: 'woff', mime: 'font/woff' },
  { extension: 'woff2', mime: 'font/woff2' },
  { extension: 'ttf', mime: 'font/ttf' },
  { extension: 'doc', mime: 'application/msword' },
  {
    extension: 'docx',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  },
  { extension: 'xls', mime: 'application/vnd.ms-excel' },
  { extension: 'xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
]

/** MIME → 扩展名（一对多，来自内置表） */
const builtinByMime: ReadonlyMap<string, string[]> = (() => {
  const map = new Map<string, string[]>()
  for (const { extension, mime } of commonMimeTypes) {
    const extensions = map.get(mime)
    if (extensions === undefined) {
      map.set(mime, [extension])
    } else if (!extensions.includes(extension)) {
      extensions.push(extension)
    }
  }
  return map
})()

function normalizeExtension(extension: string): string {
  return extension.trim().replace(/^\./, '').toLowerCase()
}

/** 扩展名 → MIME 类型；未知返回 null */
export function getMimeType(extension: string): string | null {
  const normalized = normalizeExtension(extension)
  if (normalized === '') {
    return null
  }
  const fromLib = mimeLookup(normalized)
  if (typeof fromLib === 'string') {
    return fromLib
  }
  const fromBuiltin = commonMimeTypes.find((mapping) => mapping.extension === normalized)
  return fromBuiltin?.mime ?? null
}

/** MIME 类型 → 首选扩展名；未知返回 null */
export function getExtension(mime: string): string | null {
  const normalized = mime.trim().toLowerCase()
  if (normalized === '') {
    return null
  }
  const fromLib = mimeExtension(normalized)
  if (typeof fromLib === 'string') {
    return fromLib
  }
  const fromBuiltin = builtinByMime.get(normalized)
  return fromBuiltin !== undefined ? fromBuiltin[0] : null
}

/** MIME 类型 → 全部已知扩展名（库首选 + 内置表），未知返回空数组 */
export function getExtensions(mime: string): string[] {
  const normalized = mime.trim().toLowerCase()
  if (normalized === '') {
    return []
  }
  const primary = getExtension(normalized)
  const extras = builtinByMime.get(normalized) ?? []
  return [...new Set([...(primary !== null ? [primary] : []), ...extras])]
}
