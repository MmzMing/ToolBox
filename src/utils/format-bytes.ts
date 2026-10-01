const KB = 1024
const MB = KB * 1024

/** 面向用户的体积显示：KB 取整，超过 1MB 才给两位小数 */
export function formatBytes(bytes: number): string {
  if (bytes < KB) return `${bytes} B`
  if (bytes < MB) return `${Math.round(bytes / KB)} KB`
  return `${(bytes / MB).toFixed(2)} MB`
}
