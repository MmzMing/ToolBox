export const twitterCardTypes = ['summary', 'summary_large_image', 'app', 'player'] as const

export type TwitterCardType = (typeof twitterCardTypes)[number]

export interface MetaTagOptions {
  title?: string
  description?: string
  siteName?: string
  imageUrl?: string
  pageUrl?: string
  author?: string
  twitterCard?: TwitterCardType
}

/** 属性值转义，保证生成的 HTML 属性合法 */
function escapeAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function meta(attr: 'name' | 'property', key: string, content: string): string {
  return `<meta ${attr}="${key}" content="${escapeAttribute(content)}" />`
}

/** 生成 OpenGraph 与 Twitter 分享 meta 标签块：空值行自动跳过，属性行顺序稳定 */
export function generateMetaTags(options: MetaTagOptions): string {
  const title = options.title ?? ''
  const description = options.description ?? ''
  const siteName = options.siteName ?? ''
  const imageUrl = options.imageUrl ?? ''
  const pageUrl = options.pageUrl ?? ''
  const author = options.author ?? ''
  const twitterCard = options.twitterCard ?? ''

  const hasOpenGraph =
    title !== '' || description !== '' || siteName !== '' || imageUrl !== '' || pageUrl !== ''

  const lines: string[] = []
  if (description !== '') {
    lines.push(meta('name', 'description', description))
  }
  if (author !== '') {
    lines.push(meta('name', 'author', author))
  }
  if (hasOpenGraph) {
    lines.push(meta('property', 'og:type', 'website'))
  }
  if (title !== '') {
    lines.push(meta('property', 'og:title', title))
  }
  if (description !== '') {
    lines.push(meta('property', 'og:description', description))
  }
  if (siteName !== '') {
    lines.push(meta('property', 'og:site_name', siteName))
  }
  if (imageUrl !== '') {
    lines.push(meta('property', 'og:image', imageUrl))
  }
  if (pageUrl !== '') {
    lines.push(meta('property', 'og:url', pageUrl))
  }
  if (twitterCard !== '') {
    lines.push(meta('name', 'twitter:card', twitterCard))
  }

  return lines.join('\n')
}
