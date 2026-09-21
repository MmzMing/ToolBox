#!/usr/bin/env node
// 生成 sitemap.xml 与 robots.txt 到 public/，由 prebuild 在 `vite build` 之前执行。
// 必须是"之前"：Vite 在 build 开始时就把 public/ 整体拷进 dist/，postbuild 再写
// public/ 已赶不上当次产物，线上会表现为 /robots.txt 与 /sitemap.xml 落到 SPA fallback。
// 工具 URL 从 src/tools/*/*/index.ts 的 path 字段扫描而来，与注册中心解耦
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { globSync } from 'node:fs'

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
const toolPaths = toolFiles
  .map((file) => readFileSync(path.join(root, file), 'utf8'))
  .flatMap((content) =>
    [...content.matchAll(/path:\s*['"]\/([^'"]+)['"]/g)].map((match) => match[1]),
  )
  .filter((value, index, all) => all.indexOf(value) === index)
  .sort()

const staticPaths = ['', 'about']
const allPaths = [...staticPaths, ...toolPaths]
const lastmod = new Date().toISOString().slice(0, 10)

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allPaths
  .map(
    (p) => `  <url>\n    <loc>${siteUrl}/${p}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`,
  )
  .join('\n')}
</urlset>
`

const robots = `User-agent: *
Allow: /

Sitemap: ${siteUrl}/sitemap.xml
`

writeFileSync(path.join(root, 'public/sitemap.xml'), sitemap, 'utf8')
writeFileSync(path.join(root, 'public/robots.txt'), robots, 'utf8')
console.log(`✔ sitemap.xml: ${allPaths.length} 个 URL（SITE_URL=${siteUrl}）`)
