// 相对路径 + 显式 .ts 后缀而非 '@/'：本文件被 vite.config.ts 直接导入，
// 构建配置的加载阶段既不套用 resolve.alias，原生解析也要求带后缀。
import { absoluteUrl, siteConfig } from '../../config/site.ts'

export type JsonLd = Record<string, unknown>

const SITE_ID = `${siteConfig.siteUrl}/#website`
const ORG_ID = `${siteConfig.siteUrl}/#organization`

/**
 * 每个数据节点都要带 @context：JSON-LD 缺了它就不是声明，
 * Google 富结果检测与 AI 引擎的结构化解析都会整条丢弃。
 */
const SCHEMA_CONTEXT = 'https://schema.org'

/** schema.org Organization：品牌实体，知识面板与 sameAs 归一的基础 */
export function organizationSchema(): JsonLd {
  return {
    '@context': SCHEMA_CONTEXT,
    '@type': 'Organization',
    '@id': ORG_ID,
    name: siteConfig.name,
    url: siteConfig.siteUrl,
    logo: absoluteUrl(siteConfig.icons.android512),
    sameAs: [siteConfig.githubUrl, siteConfig.blogUrl],
  }
}

/**
 * schema.org WebSite。刻意不输出 SearchAction：站内搜索是前端本地模糊匹配，
 * 没有 /search?q= 这类可被搜索引擎提交的 URL，声明出去就是无效标记。
 */
export function webSiteSchema(): JsonLd {
  return {
    '@context': SCHEMA_CONTEXT,
    '@type': 'WebSite',
    '@id': SITE_ID,
    url: `${siteConfig.siteUrl}/`,
    name: siteConfig.name,
    description: siteConfig.description,
    inLanguage: ['zh-CN', 'en'],
    publisher: { '@id': ORG_ID },
  }
}

/** 站点级实体：注入静态 index.html，不执行 JS 的爬虫与 AI 爬虫直接可读 */
export function siteGraph(): JsonLd[] {
  return [webSiteSchema(), organizationSchema()]
}

export type ToolSchemaInput = {
  /** 工具标题（已本地化） */
  title: string
  description: string
  /** 工具路由，如 '/hash-text' */
  path: string
}

/** schema.org WebApplication：每个工具页一条 */
export function toolSchema({ title, description, path }: ToolSchemaInput): JsonLd {
  return {
    '@context': SCHEMA_CONTEXT,
    '@type': 'WebApplication',
    name: title,
    url: absoluteUrl(path),
    description,
    applicationCategory: 'UtilitiesApplication',
    browserType: 'Web Browser',
    operatingSystem: 'All',
    isPartOf: { '@id': SITE_ID },
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'CNY' },
  }
}

export type Crumb = { name: string; url: string }

/** schema.org BreadcrumbList：与页面面包屑 UI 对应，此前只有 UI 没有声明 */
export function breadcrumbSchema(items: Crumb[]): JsonLd {
  return {
    '@context': SCHEMA_CONTEXT,
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  }
}

/**
 * 序列化为 <script type="application/ld+json"> 的内容。
 * 转义 '<'：标题/描述里的 '</script>' 否则会提前闭合标签，把字符串变成可执行片段。
 */
export function serializeJsonLd(data: JsonLd | JsonLd[]): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}
