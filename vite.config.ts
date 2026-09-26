import { createReadStream, existsSync, statSync } from 'node:fs'
import path from 'node:path'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vitest/config'
import type { IncomingMessage, ServerResponse } from 'node:http'

import { siteConfig, absoluteUrl } from './src/config/site.ts'
import { serializeJsonLd, siteGraph } from './src/modules/seo/schema.ts'

/**
 * index.html 是静态文件，读不到 TS 模块；head 里的标题、描述、图标与着色标签在此
 * 按 src/config/site.ts 生成，使站点信息保持 config 单一来源（dev 与 build 同一钩子）。
 */
const CHARSET_ANCHOR = '<meta charset="UTF-8" />'
const TITLE_PLACEHOLDER = '__SITE_TITLE__'
const DESCRIPTION_PLACEHOLDER = '__SITE_DESCRIPTION__'
/** 静态 head 里 OG/canonical 的落点：整行替换，值由下面的生成块提供 */
const DESCRIPTION_ANCHOR = `<meta name="description" content="${DESCRIPTION_PLACEHOLDER}" />`

/** 标题与描述来自 config 的裸字符串，转义后才放进标签/属性 */
const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')

const injectSiteBranding = {
  name: 'inject-site-branding',
  transformIndexHtml(html: string): string {
    const { icons, themeColor, title, description } = siteConfig
    const link = (attrs: Record<string, string>) =>
      `<link ${Object.entries(attrs)
        .map(([key, value]) => `${key}="${value}"`)
        .join(' ')} />`
    const icon = (href: string, type: string, sizes?: string) =>
      link({ rel: 'icon', href, type, ...(sizes && { sizes }) })
    const appleTouch = (href: string, sizes?: string) =>
      link({ rel: 'apple-touch-icon', href, ...(sizes && { sizes }) })

    const tags = [
      icon(icons.ico, 'image/x-icon'),
      icon(icons.png16, 'image/png', '16x16'),
      icon(icons.png32, 'image/png', '32x32'),
      icon(icons.png48, 'image/png', '48x48'),
      icon(icons.android192, 'image/png', '192x192'),
      icon(icons.android512, 'image/png', '512x512'),
      icon(icons.svg, 'image/svg+xml', 'any'),
      appleTouch(icons.appleTouch),
      appleTouch(icons.appleTouch152, '152x152'),
      appleTouch(icons.appleTouch167, '167x167'),
      appleTouch(icons.appleTouch180, '180x180'),
      link({ rel: 'mask-icon', href: icons.mask, color: themeColor }),
      `<meta name="theme-color" content="${themeColor}" />`,
    ].join('\n    ')

    /**
     * 静态壳的首页取值：不执行 JS 的爬虫（百度、ChatGPT/Perplexity 等 AI 爬虫）与
     * 读 OG 标签的社交抓取器只看这里，运行时 DocumentMeta 再原位改写为各页取值。
     * 属性名与 DocumentMeta 的选择器严格一致，否则 head 里会出现两条同名标签。
     */
    const imageUrl = absoluteUrl(icons.android512)
    const siteUrl = absoluteUrl('/')
    const attr = (name: string, content: string) =>
      `<meta name="${name}" content="${escapeHtml(content)}" />`
    const ogAttr = (property: string, content: string) =>
      `<meta property="${property}" content="${escapeHtml(content)}" />`
    const headSeo = [
      `<meta name="description" content="${escapeHtml(description)}" />`,
      `<link rel="canonical" href="${siteUrl}" />`,
      ogAttr('og:type', 'website'),
      ogAttr('og:site_name', siteConfig.name),
      ogAttr('og:locale', 'zh_CN'),
      ogAttr('og:title', title),
      ogAttr('og:description', description),
      ogAttr('og:image', imageUrl),
      ogAttr('og:image:width', '512'),
      ogAttr('og:image:height', '512'),
      ogAttr('og:url', siteUrl),
      attr('twitter:card', 'summary'),
      attr('twitter:title', title),
      attr('twitter:description', description),
      attr('twitter:image', imageUrl),
      // 站点级实体是数据块（不执行），因此不受部署层 CSP script-src 约束
      `<script type="application/ld+json">${serializeJsonLd(siteGraph())}</script>`,
    ].join('\n    ')

    // 必须紧跟 charset 之后：编码嗅探只读文档前 1024 字节，charset 靠后会被误判
    if (!html.includes(CHARSET_ANCHOR)) {
      throw new Error('[inject-site-branding] index.html 缺少锚点 ' + CHARSET_ANCHOR)
    }
    for (const placeholder of [TITLE_PLACEHOLDER, DESCRIPTION_PLACEHOLDER]) {
      if (!html.includes(placeholder)) {
        throw new Error(`[inject-site-branding] index.html 缺少占位符 ${placeholder}`)
      }
    }
    if (!html.includes(DESCRIPTION_ANCHOR)) {
      throw new Error('[inject-site-branding] index.html 缺少锚点 ' + DESCRIPTION_ANCHOR)
    }
    return html
      .replace(CHARSET_ANCHOR, `${CHARSET_ANCHOR}\n    ${tags}`)
      .replace(TITLE_PLACEHOLDER, escapeHtml(title))
      .replace(DESCRIPTION_ANCHOR, headSeo)
  },
} satisfies Plugin

/**
 * dev 中间件：先行响应 /codecs 与 /wasm 的静态请求。
 * 这些 WASM 产物放在 public 下供引擎在 Worker 内动态 import，
 * 但 Vite 会拦截「从源码 import public 目录文件」并报错——此中间件绕开该限制
 * （生产构建不受影响：public 目录整体拷贝进 dist）。
 */
const servePublicCodecs = {
  name: 'serve-public-codecs',
  apply: 'serve' as const,
  configureServer(server) {
    const handler = (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => {
      const url = (req.url ?? '').split('?')[0]
      if (!url.startsWith('/codecs/') && !url.startsWith('/wasm/')) {
        next()
        return
      }
      const publicDir = path.resolve(import.meta.dirname, './public')
      const filePath = path.normalize(path.join(publicDir, url))
      if (
        !filePath.startsWith(publicDir) ||
        !existsSync(filePath) ||
        !statSync(filePath).isFile()
      ) {
        next()
        return
      }
      const ext = path.extname(filePath)
      const mime =
        ext === '.js'
          ? 'text/javascript; charset=utf-8'
          : ext === '.wasm'
            ? 'application/wasm'
            : 'application/octet-stream'
      res.setHeader('Content-Type', mime)
      res.setHeader('Cache-Control', 'no-cache')
      createReadStream(filePath).pipe(res)
    }
    // unshift 到栈顶：Vite 会给动态 import 注入 ?import 查询并交给 transform 中间件
    // （其对 public 目录文件直接报错），必须抢在其之前响应
    server.middlewares.stack.unshift({ route: '', handle: handler })
  },
} satisfies Plugin

export default defineConfig({
  plugins: [react(), tailwindcss(), injectSiteBranding, servePublicCodecs],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    globals: false,
  },
})
