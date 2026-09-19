import { filesize } from 'filesize'

/** 人类可读文件大小（IEC 二进制标准，与图小小一致） */
export function formatFileSize(bytes: number): string {
  const result = filesize(bytes, { standard: 'iec' })
  return Array.isArray(result) ? result[0] : result
}

/** 压缩节省百分比（负数表示变大） */
export function percentSaved(origin: number, compressed: number): number {
  if (origin <= 0) {
    return 0
  }
  return Math.round((1 - compressed / origin) * 100)
}

/** 按输出格式替换扩展名（keep 原格式时返回原名） */
export function outputFileName(name: string, target?: string): string {
  if (!target) {
    return name
  }
  const dot = name.lastIndexOf('.')
  const base = dot > 0 ? name.slice(0, dot) : name
  const ext = target === 'jpg' ? 'jpg' : target
  return `${base}.${ext}`
}

/** 触发浏览器下载 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}
