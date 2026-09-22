const FORBIDDEN_CHARS = '\\/:*?"<>|'

const isForbidden = (char: string) => {
  const code = char.charCodeAt(0)
  return code < 0x20 || code === 0x7f || FORBIDDEN_CHARS.includes(char)
}

/** 去掉路径分隔符与控制字符，压缩空白并限长；空串兜底为 fallback */
export function sanitizeFileName(name: string, fallback = 'file'): string {
  const cleaned = Array.from(name, (char) => (isForbidden(char) ? ' ' : char))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned.slice(0, 60) || fallback
}

/** 导出文件名：时间戳 + 净化后的提示词摘要 + 扩展名 */
export function buildImageFileName(prompt: string, createdAt: number, mimeType: string): string {
  const extension = mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'image/webp' ? 'webp' : 'png'
  const stamp = new Date(createdAt).toISOString().replace(/[:.]/g, '-').slice(0, 19)
  return `${stamp}-${sanitizeFileName(prompt.slice(0, 40), 'image')}.${extension}`
}
