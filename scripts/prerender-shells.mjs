#!/usr/bin/env node
// 构建后静态壳预渲染：把 dist/index.html 按路由复制成 dist/<path>/index.html，
// 每份带自己的 title/description/keywords/canonical/OG/Twitter/JSON-LD 与可爬正文。
//
// 解决的是头号根因：纯 CSR 下 48 个工具页对不执行 JS 的爬虫（百度、ChatGPT/Perplexity
// 等 AI 抓取）返回的都是同一份首页 TDK + 空白正文。
//
// 为什么不用 Puppeteer：要落盘的只有 TDK 和一段与真实页头同构的正文，数据全来自
// i18n 与工具定义这些静态源；起浏览器只是把同样的东西再算一遍，还要背一个 Chromium
// 依赖（与 AGENTS.md §12「优先零依赖」冲突），CI 与 Windows 上都更易失败。
//
// 宿主优先级：nginx 的 `try_files $uri $uri/`、Vercel 与 Netlify 都是先查文件再 rewrite，
// 因此 /hash-text 会命中 dist/hash-text/index.html。若宿主不解析目录索引，请求照旧落回
// SPA fallback —— 等于没拿到收益，但不会出错。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import {
  SEO_BLOCK_BEGIN,
  SEO_BLOCK_END,
  buildSeoHead,
  escapeHtml,
  injectShellBody,
} from '../src/modules/seo/static-head.ts'
import { breadcrumbSchema, toolSchema } from '../src/modules/seo/schema.ts'
import {
  collectTools,
  readBundle,
  readCategoryOrder,
  readSiteName,
  readSiteUrl,
  readToolCopy,
} from './lib/site-routes.mjs'

const root = path.resolve(import.meta.dirname, '..')
const dist = path.join(root, 'dist')
const templateFile = path.join(dist, 'index.html')

if (!existsSync(templateFile)) {
  throw new Error(`[prerender] 找不到 ${templateFile}，请在 vite build 之后执行本脚本`)
}
const template = readFileSync(templateFile, 'utf8')

const siteUrl = readSiteUrl(root)
const siteName = readSiteName(root)
const zhHome = readBundle(root, 'zh', 'home')
const zhAbout = readBundle(root, 'zh', 'about')
const zhCommon = readBundle(root, 'zh', 'common')
const zhCategories = readBundle(root, 'zh', 'categories') ?? {}
const tools = collectTools(root).map((tool) => ({ ...tool, copy: readToolCopy(root, tool) }))
/** 相关工具按名字解析（名字 = 路由去斜杠，由 check-tool-seo-keys 保证一致） */
const byName = new Map(tools.map((tool) => [tool.name, tool]))

const breadcrumbHome = zhCommon?.breadcrumbHome ?? '工具集'
/** 品牌后缀：静态壳按站点默认语言（中文）出，与 tool-layout.tsx 的运行时拼法一致 */
const pageTitle = (title) => `${title} · ${siteName}`
const pageUrl = (route) => `${siteUrl}/${route}`
/** i18next 的 {{var}} 插值在脚本侧的最小实现 */
const interpolate = (text, vars) => text.replace(/\{\{(\w+)\}\}/g, (raw, key) => vars[key] ?? raw)

/** 缺键时 undefined 会被写进 HTML，比编译期报错更难发现，这里直接失败 */
function requireCopy(bundle, key, namespace) {
  const value = bundle?.[key]
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`[prerender] zh/${namespace}.${key} 缺失或为空`)
  }
  return value
}

function replaceSeoBlock(html, head) {
  const start = html.indexOf(SEO_BLOCK_BEGIN)
  const end = html.indexOf(SEO_BLOCK_END)
  if (start < 0 || end < 0) {
    throw new Error(
      '[prerender] HTML 里缺少 SEO 块标记，检查 vite.config.ts 的 inject-site-branding 是否生效',
    )
  }
  return html.slice(0, start) + head + html.slice(end + SEO_BLOCK_END.length)
}

/** 正文容器类名与 ToolLayout 保持一致，首屏被 React 替换时才不产生位移 */
const containerClass = (wide) => `mx-auto w-full max-w-${wide ? 'screen-2xl' : '6xl'} px-4 py-6`

const homeBody = () => {
  const groups = readCategoryOrder(root)
    .map((category) => ({
      name: zhCategories[category] ?? category,
      items: tools.filter((tool) => tool.category === category),
    }))
    .filter((group) => group.items.length > 0)
  const sections = groups.map((group) =>
    [
      '  <section>',
      `    <h2>${escapeHtml(group.name)}</h2>`,
      '    <ul>',
      ...group.items.map(
        (tool) =>
          `      <li><a href="${escapeHtml(pageUrl(tool.path))}">${escapeHtml(
            tool.copy.zh.title,
          )}</a> — ${escapeHtml(tool.copy.zh.description)}</li>`,
      ),
      '    </ul>',
      '  </section>',
    ].join('\n'),
  )
  // 整段进 <noscript>：脚本开启时浏览器不渲染，用户在 React 挂载前看到空白而不是
  // 一屏无排版文字；按源码解析的爬虫照样读到 Hero 与 48 条带锚文本的分类内链
  return [
    '<main class="mx-auto w-full max-w-6xl px-4 py-8">',
    '  <section class="flex flex-col items-center gap-6 py-14 text-center md:gap-8 md:py-20">',
    `    <h1 class="max-w-3xl text-4xl font-bold tracking-tighter text-balance sm:text-5xl md:text-6xl">${escapeHtml(
      interpolate(requireCopy(zhHome, 'title', 'home'), { site: siteName }),
    )}</h1>`,
    `    <p class="text-muted-foreground max-w-2xl text-base leading-relaxed text-pretty md:text-lg">${escapeHtml(
      requireCopy(zhHome, 'subtitle', 'home'),
    )}</p>`,
    '  </section>',
    '</main>',
    '<nav aria-label="工具分类">',
    sections.join('\n'),
    '</nav>',
  ].join('\n')
}

const toolBody = (tool) =>
  [
    `<main class="${containerClass(tool.wide)}">`,
    `  <h1 class="truncate text-xl font-semibold md:text-2xl">${escapeHtml(tool.copy.zh.title)}</h1>`,
    `  <p class="text-muted-foreground mt-2 text-sm">${escapeHtml(tool.copy.zh.description)}</p>`,
    `  <p class="text-muted-foreground mt-6 text-sm"><a href="${escapeHtml(pageUrl(''))}">${escapeHtml(
      breadcrumbHome,
    )}</a></p>`,
    '</main>',
  ].join('\n')
const aboutBody = (title, qa) =>
  [
    '<main class="mx-auto w-full max-w-4xl px-4 py-8">',
    `  <h1 class="text-2xl font-bold md:text-3xl">${escapeHtml(title)}</h1>`,
    ...qa.flatMap(([question, answer]) => [
      `  <h2 class="mt-10 text-xl font-semibold md:text-2xl">${escapeHtml(question)}</h2>`,
      `  <p class="text-muted-foreground mt-3 text-sm leading-relaxed md:text-base">${escapeHtml(answer)}</p>`,
    ]),
    `  <p class="mt-6 text-sm"><a href="${escapeHtml(pageUrl(''))}">${escapeHtml(
      breadcrumbHome,
    )}</a> · <a href="${escapeHtml(pageUrl('llms.txt'))}">llms.txt</a></p>`,
    '</main>',
  ].join('\n')

let written = 0

/** head 省略时保留模板里 vite 已注入的首页 SEO 块，只换正文 */
function emit(route, content, head) {
  const html = injectShellBody(head ? replaceSeoBlock(template, head) : template, content)
  const outDir = route === '' ? dist : path.join(dist, route)
  mkdirSync(outDir, { recursive: true })
  writeFileSync(path.join(outDir, 'index.html'), html, 'utf8')
  written += 1
}

emit('', homeBody())

for (const tool of tools) {
  const { title, description } = tool.copy.zh
  emit(
    tool.path,
    toolBody(tool),
    buildSeoHead({
      title: pageTitle(title),
      description,
      path: `/${tool.path}`,
      keywords: tool.keywords,
      jsonLd: [
        toolSchema({ title, description, path: `/${tool.path}` }),
        breadcrumbSchema([
          { name: breadcrumbHome, url: pageUrl('') },
          { name: title, url: pageUrl(tool.path) },
        ]),
      ],
    }),
  )
}

const aboutTitle = interpolate(requireCopy(zhAbout, 'title', 'about'), { site: siteName })
/** 关于页问答：正文与 about-page.tsx 的 Q1–Q6 同源，q6 的协议名在两句之间 */
const aboutQa = ['q1', 'q2', 'q3', 'q4', 'q5'].map((key) => [
  requireCopy(zhAbout, `${key}Title`, 'about'),
  interpolate(requireCopy(zhAbout, `${key}Body`, 'about'), {
    site: siteName,
    count: tools.length,
    categories: readCategoryOrder(root).length,
  }),
])
aboutQa.push([
  requireCopy(zhAbout, 'q6Title', 'about'),
  [requireCopy(zhAbout, 'q6Body', 'about'), 'MIT', requireCopy(zhAbout, 'q6Tail', 'about')].join(
    ' ',
  ),
])
emit(
  'about',
  aboutBody(aboutTitle, aboutQa),
  buildSeoHead({
    // about.title 自身已含品牌名（「关于 {{site}}」），不再拼后缀，否则品牌在一次出现两遍
    title: aboutTitle,
    description: requireCopy(zhAbout, 'metaDescription', 'about'),
    path: '/about',
  }),
)

console.log(
  `✔ prerender-shells: ${written} 份静态壳（首页正文 + ${tools.length} 个工具页 + 关于页）`,
)
