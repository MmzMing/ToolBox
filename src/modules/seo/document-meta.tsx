import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { absoluteUrl, siteConfig } from '@/config/site'

type DocumentMetaProps = {
  title: string
  description: string
  /** 页面路由（如 '/hash-text'）：canonical 与 og:url 的依据。省略则清除（如 404） */
  path?: string
  keywords?: string[]
  /** 携带用户数据、无搜索价值的页面（简历编辑器等） */
  noindex?: boolean
}

type TagSpec = {
  tag: 'meta' | 'link'
  /** 定位选择器：同一属性组合在 head 里必须只有一条 */
  match: string
  attrs: Record<string, string>
}

const metaTag = (name: string, content: string): TagSpec => ({
  tag: 'meta',
  match: `meta[name="${name}"]`,
  attrs: { name, content },
})

const ogTag = (property: string, content: string): TagSpec => ({
  tag: 'meta',
  match: `meta[property="${property}"]`,
  attrs: { property, content },
})

function buildTagSpecs({
  title,
  description,
  url,
  keywords,
  noindex,
  ogLocale,
}: {
  title: string
  description: string
  url?: string
  keywords?: string[]
  noindex: boolean
  ogLocale: string
}): TagSpec[] {
  const image = absoluteUrl(siteConfig.ogImage)
  const specs = [
    metaTag('description', description),
    // 只 noindex 不 nofollow：这些页面仍要把链接信号传给工具页
    metaTag('robots', noindex ? 'noindex, follow' : 'index, follow'),
    ogTag('og:type', 'website'),
    ogTag('og:site_name', siteConfig.name),
    ogTag('og:locale', ogLocale),
    ogTag('og:title', title),
    ogTag('og:description', description),
    ogTag('og:image', image),
    metaTag('twitter:card', 'summary_large_image'),
    metaTag('twitter:title', title),
    metaTag('twitter:description', description),
    metaTag('twitter:image', image),
  ]
  if (url) {
    specs.push({
      tag: 'link',
      match: 'link[rel="canonical"]',
      attrs: { rel: 'canonical', href: url },
    })
    specs.push(ogTag('og:url', url))
  }
  if (keywords && keywords.length > 0) {
    specs.push(metaTag('keywords', keywords.join(', ')))
  }
  return specs
}

/**
 * 文档级 SEO 元信息：对 head 做原位 upsert。
 *
 * 刻意不用 React 19 的声明式标签提升：静态 index.html 里已有一份首页取值（给不执行
 * JS 的爬虫），React 再插入同名标签就会留下两条 href 不同的 canonical，
 * 而 Google 对互相冲突的 canonical 是一概忽略。
 */
export function DocumentMeta({
  title,
  description,
  path,
  keywords,
  noindex = false,
}: DocumentMetaProps) {
  const { i18n } = useTranslation()
  const url = path ? absoluteUrl(path) : undefined
  const ogLocale = i18n.language?.startsWith('zh') ? 'zh_CN' : 'en_US'

  useEffect(() => {
    document.title = title
    const specs = buildTagSpecs({ title, description, url, keywords, noindex, ogLocale })
    for (const spec of specs) {
      const el: HTMLElement =
        document.head.querySelector(spec.match) ?? document.createElement(spec.tag)
      for (const [key, value] of Object.entries(spec.attrs)) {
        el.setAttribute(key, value)
      }
      if (!el.isConnected) {
        document.head.appendChild(el)
      }
    }
    if (!url) {
      document.head.querySelector('link[rel="canonical"]')?.remove()
      document.head.querySelector('meta[property="og:url"]')?.remove()
    }
  }, [title, description, url, keywords, noindex, ogLocale])

  return null
}
