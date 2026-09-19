export interface SvgPlaceholderOptions {
  /** 图片宽度（像素），必须为正数 */
  width: number
  /** 图片高度（像素），必须为正数 */
  height: number
  /** 背景色（任意 CSS 颜色值） */
  bgColor: string
  /** 前景色（文字颜色） */
  fgColor: string
  /** 居中显示的文本 */
  text: string
  /** 字体大小（像素） */
  fontSize: number
}

/** 转义 XML 特殊字符（& < > ' "），保证文本插入 SVG 后仍合法 */
export function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll("'", '&apos;')
    .replaceAll('"', '&quot;')
}

/** 生成居中文本的 SVG 占位图字符串，宽高非法时抛 Error */
export function buildSvgPlaceholder(options: SvgPlaceholderOptions): string {
  const { width, height, bgColor, fgColor, text, fontSize } = options
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
    throw new Error('Width and height must be positive numbers')
  }
  const escapedText = escapeXml(text)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="${bgColor}"/><text x="50%" y="50%" fill="${fgColor}" font-family="sans-serif" font-size="${fontSize}" text-anchor="middle" dominant-baseline="middle">${escapedText}</text></svg>`
}

/** SVG 字符串转 data URI（img 可直接作为 src 使用） */
export function svgToDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}
