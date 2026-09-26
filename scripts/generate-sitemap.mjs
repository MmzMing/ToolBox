#!/usr/bin/env node
// 生成 sitemap.xml 与 robots.txt 到 public/，由 prebuild 在 `vite build` 之前执行。
// 必须是"之前"：Vite 在 build 开始时就把 public/ 整体拷进 dist/，postbuild 再写
// public/ 已赶不上当次产物，线上会表现为 /robots.txt 与 /sitemap.xml 落到 SPA fallback。
// 工具 URL 从 src/tools/*/*/index.ts 的 path 字段扫描而来，与注册中心解耦
import { globSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')

/** 域名以 src/config/site.ts 为单一来源（此处正则读取，避免脚本依赖 TS 运行时） */
function configuredSiteUrl() {
  const source = readFileSync(path.join(root, 'src/config/site.ts'), 'utf8')
  const match = source.match(/siteUrl:\s*'([^']+)'/)
  if (!match) {
    throw new Error('Cannot read siteUrl from src/config/site.ts')
  }
  return match[1]
}

// SITE_URL 只用于临时覆盖（预览环境、换域名灰度）
const siteUrl = (process.env.SITE_URL ?? configuredSiteUrl()).replace(/\/$/, '')

const toolFiles = globSync('src/tools/*/*/index.ts', { cwd: root })
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

const toolEntries = toolFiles
  .map((file) => readFileSync(path.join(root, file), 'utf8'))
  .map((content) => ({
    path: content.match(/path:\s*['"]\/([^'"]+)['"]/)?.[1],
    // lastmod 用各工具真实的创建日：全站同一个日期等于没有日期，爬虫会忽略该字段
    lastmod: content.match(/createdAt:\s*['"](\d{4}-\d{2}-\d{2})['"]/)?.[1],
  }))
  .filter((entry) => entry.path)
  .sort((a, b) => a.path.localeCompare(b.path))

/** 首页与关于页会列出全部工具，其内容更新日 = 最近一个工具的上架日 */
const siteLastmod = toolEntries
  .map((entry) => entry.lastmod)
  .filter((value) => value && ISO_DATE.test(value))
  .sort()
  .at(-1)

const urlEntries = [
  { path: '', lastmod: siteLastmod },
  { path: 'about', lastmod: siteLastmod },
  ...toolEntries.map((entry) => ({ path: entry.path, lastmod: entry.lastmod })),
].filter((entry, index, all) => all.findIndex((other) => other.path === entry.path) === index)

// changefreq / priority 不写：Google 明确声明会忽略这两个提示，只增加噪音
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries
  .map((entry) => {
    const lastmod = entry.lastmod && ISO_DATE.test(entry.lastmod) ? entry.lastmod : undefined
    return [
      '  <url>',
      `    <loc>${siteUrl}/${entry.path}</loc>`,
      ...(lastmod ? [`    <lastmod>${lastmod}</lastmod>`] : []),
      '  </url>',
    ].join('\n')
  })
  .join('\n')}
</urlset>
`

// 不 Disallow /resume/：抓取被挡住后爬虫看不到页面里的 noindex，
// 反而可能凭外链把它收进索引（只带 URL 不带正文）。编辑器页靠运行时 noindex 处理。
const robots = `User-agent: *
Allow: /

Sitemap: ${siteUrl}/sitemap.xml
`

writeFileSync(path.join(root, 'public/sitemap.xml'), sitemap, 'utf8')
writeFileSync(path.join(root, 'public/robots.txt'), robots, 'utf8')
console.log(`✔ sitemap.xml: ${urlEntries.length} 个 URL（SITE_URL=${siteUrl}）`)
