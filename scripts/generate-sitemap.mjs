#!/usr/bin/env node
// 构建后生成 sitemap.xml 与 robots.txt（postbuild 自动执行）
// 工具 URL 从 src/tools/*/*/index.ts 的 path 字段扫描而来，与注册中心解耦
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { globSync } from 'node:fs'

const root = path.resolve(import.meta.dirname, '..')
const siteUrl = (process.env.SITE_URL ?? 'https://toolbox.local').replace(/\/$/, '')

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
