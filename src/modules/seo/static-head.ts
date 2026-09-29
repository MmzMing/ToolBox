// 相对路径 + 显式 .ts 后缀：本文件同时被 vite.config.ts（构建配置）与
// scripts/prerender-shells.mjs（Node）导入，两者都不套 resolve.alias。
import { absoluteUrl, siteConfig } from '../../config/site.ts'
import { serializeJsonLd, siteGraph, type JsonLd } from './schema.ts'

/** index.html 里静态 SEO 块的落点；构建配置整行替换它 */
export const SEO_SLOT = '<!-- seo:slot -->'
/** 生成后的 SEO 块用这对标记包住，供预渲染脚本按路由整块替换 */
export const SEO_BLOCK_BEGIN = '<!-- seo:block:start -->'
export const SEO_BLOCK_END = '<!-- seo:block:end -->'

export type StaticSeoHeadInput = {
  /** <title> 全文（含品牌后缀） */
  title: string
  description: string
  /** 页面路由，如 '/' 或 '/hash-text' */
  path: string
  keywords?: readonly string[]
  /** 携带用户数据、无搜索价值的页面 */
  noindex?: boolean
  /** og:locale，与 DocumentMeta 的取值口径一致 */
  ogLocale?: string
  /** 站点实体之外，本页自己的 JSON-LD 节点 */
  jsonLd?: readonly JsonLd[]
}

/** 属性值与正文文本共用：& < > " 都必须转义，否则文案里的 > 会撕裂标签 */
export const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * 生成一份「不执行 JS 的爬虫也能读到」的 head SEO 块（title + description + robots +
 * canonical + OG + Twitter + JSON-LD）。
 *
 * 标签名与属性组合必须与 `document-meta.tsx` 的选择器严格一致：运行时它对 head 做原位
 * upsert，两边字段对不上就会留下两条 href 不同的 canonical，而 Google 对冲突 canonical
 * 是一概忽略。
 */
export function buildSeoHead({
  title,
  description,
  path,
  keywords = [],
  noindex = false,
  ogLocale = 'zh_CN',
  jsonLd = [],
}: StaticSeoHeadInput): string {
  const url = absoluteUrl(path)
  const image = absoluteUrl(siteConfig.ogImage)
  const meta = (name: string, content: string) =>
    `<meta name="${name}" content="${escapeHtml(content)}" />`
  const og = (property: string, content: string) =>
    `<meta property="${property}" content="${escapeHtml(content)}" />`
  const micro = (itemprop: string, content: string) =>
    `<meta itemprop="${itemprop}" content="${escapeHtml(content)}" />`

  const tags = [
    `<title>${escapeHtml(title)}</title>`,
    meta('description', description),
    // 只 noindex 不 nofollow：这些页面仍要把链接信号传给工具页
    meta('robots', noindex ? 'noindex, follow' : 'index, follow'),
    ...(keywords.length > 0 ? [meta('keywords', keywords.join(', '))] : []),
    `<link rel="canonical" href="${url}" />`,
    og('og:type', 'website'),
    og('og:site_name', siteConfig.name),
    og('og:locale', ogLocale),
    og('og:title', title),
    og('og:description', description),
    og('og:image', image),
    og('og:image:width', '1200'),
    og('og:image:height', '630'),
    og('og:url', url),
    meta('twitter:card', 'summary_large_image'),
    meta('twitter:title', title),
    meta('twitter:description', description),
    meta('twitter:image', image),
    // QQ / QQ 空间的抓取器读 microdata 而不是 og:*，缺这三行时它的卡片是空白标题 + 无图。
    // 值与 og:* 严格同源，避免两处漂移出互相矛盾的分享文案。
    micro('name', title),
    micro('image', image),
    micro('description', description),
    `<script data-seo-static type="application/ld+json">${serializeJsonLd([...siteGraph(), ...jsonLd])}</script>`,
  ]

  return `${SEO_BLOCK_BEGIN}\n    ${tags.join('\n    ')}\n    ${SEO_BLOCK_END}`
}

const ROOT_SLOT = '<div id="root"></div>'

/**
 * 把可爬正文写进 `<noscript>`，**#root 保持为空**。
 *
 * 为什么不放进 #root：React 挂载前要等主包下载并执行，这段时间用户看到的就是容器里的内容。
 * 放正文进去，首屏就是一屏没有排版的纯文字（线上实测 2–4 秒），看着像页面坏了；
 * 放进 `#root` 之外的 `<noscript>`，脚本开启时浏览器不渲染它，用户什么也不会看到，
 * 而按源码解析的爬虫（百度、AI 抓取）照样读到标题、描述与带锚文本的内链。
 */
export function injectShellBody(html: string, content: string): string {
  if (!html.includes(ROOT_SLOT)) {
    throw new Error(`[prerender] HTML 缺少容器 ${ROOT_SLOT}`)
  }
  return html.replace(ROOT_SLOT, `${ROOT_SLOT}\n    <noscript>\n      ${content}\n    </noscript>`)
}
