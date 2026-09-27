# ToolBox 全站 SEO 优化策略

> 站点：https://tool.mmzhiku.xyz ｜ 技术栈：React 19 + Vite 8 + react-router v8（纯 CSR SPA）
> 体检日期：2026-09-26 ｜ 数据来源：本地源码审计 + 线上真实响应抓取（`curl`，未执行 JS）
> 本文所有结论均附证据，不做无据推测；引用的行业事实见文末「外部依据」。

---

## 0. 执行摘要（先看这一节）

现状一句话：**站点不是"优化不到位"，而是结构性地"没被搜索引擎看见"**。

线上实测：请求 `https://tool.mmzhiku.xyz/hash-text`，服务器返回的原始 HTML 是——

```html
<title>MmzMing的工具箱 - 在线工具箱</title>
<meta
  name="description"
  content="免费开源的在线工具箱：加密、转换、编码、网络、文本处理等 80+ 实用工具…"
/>
```

这是**首页的标题与描述**。也就是说，56 个工具页 + 首页 + 关于页，在**任何不执行 JavaScript 的爬虫眼里是完全相同的三个标签、一片空白正文**。

原因：`dist/` 下只有 `index.html` 一个 HTML 文件（已核实），标题/描述由 React 运行时通过 `<DocumentMeta>` 注入；`/hash-text` 的真实标题「文本哈希计算 · MmzMing的工具箱」只存在于执行 JS 之后的 DOM 里。

最要命的是——**决定你要不要做的，不是 Google**：

| 抓取方                                   | 是否执行 JS                                          | 看到的 `/hash-text`                        |
| ---------------------------------------- | ---------------------------------------------------- | ------------------------------------------ |
| Googlebot                                | 会（第二波渲染队列，秒~天级延迟，可失败）            | 内容大致能看到，但慢且不稳定               |
| 百度蜘蛛                                 | 能力远低于真实浏览器，抓取→渲染分离，排队数小时~数天 | 正文大概率抓不到                           |
| ChatGPT / Perplexity / Gemini 等 AI 爬虫 | **绝大多数不执行 JS**                                | **一个空白页 —— 你在 AI 搜索里完全不存在** |

对一个中文为主的工具站，百度是主渠道；而 2026 年增长最快的流量入口是 AI 搜索。当前架构在**两个渠道同时失明**。

**修复杠杆排序（按"投入产出比"）：**

| #   | 动作                                           | 解决的根因               | 预期效果                            | 工作量                    |
| --- | ---------------------------------------------- | ------------------------ | ----------------------------------- | ------------------------- |
| 1   | **构建期预渲染**（56 路由产出静态 HTML）       | 全部页面主题/正文缺失    | 收录量、排名可能性的天花板被打开    | 中（1 个脚本 + 1 处改造） |
| 2   | **补 JSON-LD 结构化数据**                      | 零富结果、零 AI 引用锚点 | 拿站点链接、富结果、AI 可引用性     | 低                        |
| 3   | **修 sitemap + 补 canonical/og**               | 抓取与去重信号缺失       | 收录覆盖、去重、社媒/AI 摘要        | 低                        |
| 4   | **工具页内容层**（导语/如何使用/FAQ/相关工具） | 长尾词零覆盖、正文过薄   | 单页从"只有 UI"变成"能被检索的文档" | 高（需写内容）            |
| 5   | **英文路由化 + hreflang**                      | 英文版对搜索引擎不存在   | 新增一整个语言市场的流量            | 高（架构调整）            |

⚠️ 第 4 项是**唯一能带来持续流量增长的部分**；第 1–3 项是**解锁前提**——不先做，第 4 项的内容再多也可能不被索引。

---

## 1. 体检结果（实证）

### 1.1 已确认的健康项 ✅

| 项目                           | 状态 | 证据                                                          |
| ------------------------------ | ---- | ------------------------------------------------------------- |
| robots.txt 存在且不误拦        | ✅   | `Allow: /`，且声明了 Sitemap                                  |
| sitemap.xml 存在，绝对地址正确 | ✅   | 54 个 `<loc>`，域名取自 `siteConfig.siteUrl` 单一来源         |
| 语义 HTML 结构有 H1            | ✅   | `ToolLayout` 每页一个 `<h1>{title}</h1>`                      |
| 网站图标体系完整               | ✅   | 16/32/48/192/512 + apple-touch + mask-icon                    |
| 面包屑 UI 存在                 | ✅   | `base-layout.tsx` 用到 `ui/breadcrumb.tsx`                    |
| 工具懒加载（代码分割）         | ✅   | `component: () => import(...)`，未把 56 个工具打进首包        |
| 主 UI 字体非 CJK 大写字体      | ✅   | 中文字体仅被 `resume` / `music-to-video` 引用，不影响首页 LCP |
| 移动端 viewport 配置正确       | ✅   | `viewport-fit=cover`                                          |

### 1.2 缺陷清单（按严重度）

#### 🔴 P0-1 纯 CSR，无预渲染 / SSG —— 头号根因

- `dist/` 只有 `index.html`（`find dist -name "*.html"` 仅 1 条）。
- 线上 `/hash-text` 原始 HTML 的 `<title>` = 首页标题（已 `curl` 实测）。
- 后果：**所有页面标题/描述重复 + 正文为空**。
  - 重复标题是 Google 的经典去重信号，会导致"Google 选择了与您不同的规范网址"甚至不收录；
  - 百度抓取阶段拿不到正文，进入渲染队列又大概率超时/失败；
  - AI 爬虫直接看到空页 → 无法引用 → AI 搜索渠道 0 曝光。

#### 🔴 P0-2 零结构化数据（JSON-LD）

全仓 `grep "application/ld+json"` 无任何业务代码命中。缺失：

- `WebSite` + `SearchAction`（丢失站内搜索框富结果）
- `Organization`（丢失品牌知识面板基础）
- `SoftwareApplication` / `WebApplication`（工具站最该有的类型）
- `BreadcrumbList`（有面包屑 UI，但没告诉搜索引擎）
- `FAQPage` / `HowTo`（新增内容层后应同步输出）

#### 🔴 P0-3 语言未按 URL 分离，英文版对搜索引擎不存在

`src/modules/i18n/index.ts` 的 `changeLocale()` 只做 `usePreferencesStore.setLocale()` + `i18next.changeLanguage()`——**没有 `/en/` 路由，URL 不变**。

- 英文内容对爬虫零可见，英文流量为 0；
- 无法实施 `hreflang`（没有可指向的英文 URL）；
- 且 `index.html` 硬编码 `lang="zh-CN"`，即使用户是英文也如此，语言信号自相矛盾。

对"80+ 工具的开发者工具站"，英文流量的潜在量级**大于**中文（同类竞品 it-tools、toolbox 类站点流量主要来自英文）。这是最大的一块未开采蛋糕。

#### 🟠 P0-4 sitemap 已陈旧 + lastmod 失真

- 注册工具 56 个，sitemap 只含 52 个工具 + `about`——**缺失 4 个**：`docker-memo`、`maven-memo`、`nvm-memo`、`image-stack`（均已确认有 `path: '/xxx'` 定义）。
- 原因是 `public/sitemap.xml` 是**被 git 跟踪的生成物**，最新内容停留在 `lastmod 2026-09-24`（今天 09-26），新工具加入后未重建即提交。
- 全部 54 条 `<lastmod>` 都是同一天（构建日），**而 `urlset` 未声明 `xmlns:xhtml`，也没有 `changefreq` / `priority`**。全站同一 lastmod 等于没有 lastmod，爬虫会忽略该字段。

#### 🟠 P0-5 `<DocumentMeta>` 能力不足

`src/modules/seo/document-meta.tsx` 仅输出 `title / description / keywords / og:title / og:description`。缺失：

- `rel="canonical"` —— SPA 尤其需要（`/resume/:id` 等参数化 URL 会被重复收录）
- `og:url` / `og:type` / `og:site_name` / `og:image` / `og:locale`
- `twitter:card` / `twitter:image` —— 无图则社交与 AI 摘要降级为纯文本卡片
- `robots`（无法对编辑器等页面做 `noindex`）
- `hreflang` 输出位（配合 P0-3）

#### 🟠 P0-6 内容层缺失，长尾词零覆盖

`tools-*.json` 里的 `description` 是 UI 微文案，例如：

```json
"bcrypt": { "short": "Bcrypt 密码哈希与校验" }
```

8 个字。这是**界面说明**，不是 meta description，更不是可被检索的正文。工具页当前只有「标题 + 一行描述 + 工具 UI」，没有：

- 首屏导语（承载主关键词）
- 「如何使用」步骤（命中 `xx怎么用` / `xx教程`）
- 「常见问题」FAQ（命中长尾问句 + 可拿 PAA / AI 摘要）
- 「相关工具」内链（当前**内链几乎全靠侧栏导航**，工具页之间没有语义化互链，爬虫图很平）

#### 🟡 P1-1 `/resume/:id` 参数化 URL 未做 noindex

`router.tsx` 有 `path: '/resume/:id'` 独立路由（满屏编辑器）。这类 URL 无搜索价值、且携带用户数据，应 `noindex` + robots 收敛。

#### 🟡 P1-2 首页 title 未含品类词

`MmzMing的工具箱 - 在线工具箱` 是**品牌词**，无一个搜索意图词。首页是站点权重最高的页面，应承载核心品类词。

#### 🟡 P1-3 Core Web Vitals 风险

- HTML `Cache-Control: public,max-age=0,must-revalidate`（EdgeOne 默认）→ 每次导航都回源校验，TTFB 不可控。
- LCP 依赖 JS 下载 + i18n 语言包 `await` 完成 + React 挂载（`main.tsx` 里 `bootstrap()` 是 `await initI18n()` 之后才 `render`）→ **首屏内容必然晚于 JS**。
- 预渲染能同时改善这一点（HTML 里直接有内容）。

#### 🟡 P1-4 中文大写字体未做子集化

`public/fonts/` 共约 **111 MB**：`NotoSansSC-*.otf`（约 16.5 MB/个 ×3）、`SourceHanSerifSC-*.otf`（约 11.7 MB/个 ×3）、`AlibabaPuHuiTi-*.ttf`（约 8.5 MB ×2）、`MiSans-*.ttf`（约 8 MB ×2）。
虽不影响首页（首页用 Geist），但 `/resume` 选字体、`/music-to-video` 渲染视频时会拉取单个 8–17 MB 的字体文件，移动端基本卡死。

#### ⚪ P2 其他

- `favicon.svg` 为自动描摹生成、约 418 KB（源码注释已标注）——作为 icon 影响有限，但可压缩。
- 无 `manifest.webmanifest`（Android 加到主屏靠 `link rel=icon` 兜底）。
- sitemap 无分片机制（当前规模不需要，记录为扩展预案）。
- 未发现 `hreflang`、未发现任何 `og:image`，全站无社交分享图。

---

## 2. 技术修复方案（含可落地代码）

### 2.1 P0-1 预渲染：方案选型与实现

**候选方案对比：**

| 方案                        | 改动量                                                | 风险                        | 结论           |
| --------------------------- | ----------------------------------------------------- | --------------------------- | -------------- |
| 迁移 Next.js / Vike（SSG）  | 重构路由、布局、Provider、i18n                        | 高，且与 AGENTS.md 约束冲突 | ✗ 不建议现阶段 |
| `vite-react-ssg`            | 中，但其对 react-router v8 data router 兼容性未经验证 | 中                          | ⚪ 备选        |
| **构建后 Puppeteer 预渲染** | **低（加 1 个脚本 + 改 1 处）**                       | **低，完全框架无关**        | ✅ **推荐**    |

推荐理由：站点是**纯静态 56 条固定路由**，内容不随请求变化——这是 SSG 的完美场景。Puppeteer 方案**不改任何业务代码**，且有个额外好处：它能真实执行 React，**自动把 `<DocumentMeta>` 在运行时注入的 title/description/关键词、以及你后续新增的 JSON-LD 一并烘进静态 HTML**，无需另做一套 SSR 元信息通道。

**实现步骤：**

**① 安装依赖**

```bash
pnpm add -D puppeteer
```

**② 新增 `scripts/prerender.mjs`**

```js
#!/usr/bin/env node
// 构建后预渲染：起 vite preview 本地静态服务，用 headless Chromium 逐条访问路由，
// 把「执行 JS 后」的完整 DOM 落盘为静态 HTML。
// 目的：让不执行 JS 的爬虫（百度、各 AI 爬虫）在首次请求即拿到完整正文与 meta。
import { spawn } from 'node:child_process'
import { globSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import puppeteer from 'puppeteer'

const root = path.resolve(import.meta.dirname, '..')
const dist = path.join(root, 'dist')
const PORT = 4173
const ORIGIN = `http://localhost:${PORT}`

/** 与 generate-sitemap.mjs 同源：从工具定义扫描 path，保证两处路由集合一致 */
function collectRoutes() {
  const files = globSync('src/tools/*/*/index.ts', { cwd: root })
  const toolPaths = files
    .map((file) => readFileSync(path.join(root, file), 'utf8'))
    .flatMap((content) =>
      [...content.matchAll(/path:\s*['"]\/([^'"]+)['"]/g)].map((match) => match[1]),
    )
  // /resume/:id 是应用态编辑器，不预渲染（不参与 SEO）
  return [...new Set(['', 'about', ...toolPaths])]
}

function waitForServer(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const res = await fetch(url)
        if (res.ok) return resolve()
      } catch {
        /* 服务未起，继续重试 */
      }
      if (Date.now() > deadline) return reject(new Error(`preview 未在 ${timeoutMs}ms 内就绪`))
      setTimeout(tick, 300)
    }
    tick()
  })
}

const server = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['vite', 'preview', '--port', String(PORT), '--strictPort'],
  { cwd: root, stdio: 'ignore' },
)

try {
  await waitForServer(`${ORIGIN}/`)
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] })
  const routes = collectRoutes()

  for (const route of routes) {
    const page = await browser.newPage()
    // 统一按中文预渲染（首访默认语言），英文版本在路由化后单独处理
    await page.evaluateOnNewDocument(() => localStorage.setItem('toolbox:locale', 'zh'))
    await page.goto(`${ORIGIN}/${route}`, { waitUntil: 'networkidle0', timeout: 30_000 })
    // 等 React 挂载出 H1，确保拿到的是渲染后 DOM 而非空壳
    await page.waitForSelector('h1', { timeout: 15_000 })

    const html = await page.content()
    const outDir = route === '' ? dist : path.join(dist, route)
    mkdirSync(outDir, { recursive: true })
    writeFileSync(path.join(outDir, 'index.html'), html, 'utf8')
    console.log(`✔ prerendered /${route}`)
    await page.close()
  }

  await browser.close()
  console.log(`✔ 预渲染完成：${routes.length} 条路由`)
} finally {
  server.kill()
}
```

**③ 接入构建流水线**（`package.json`）

```json
"prebuild": "node scripts/prepare-codecs.mjs && node scripts/generate-sitemap.mjs",
"build": "tsc -b && vite build && node scripts/prerender.mjs",
```

**④ 验证（必做，别跳）**

```bash
pnpm build
# 关键验收：静态 HTML 里必须出现工具自己的标题，而不是首页标题
grep -o "<title>[^<]*</title>" dist/hash-text/index.html
# 期望：<title>文本哈希计算 · MmzMing的工具箱</title>
```

**⑤ 部署侧确认**（EdgeOne Pages）
确认静态托管对 `/hash-text` 的解析优先级为 `dist/hash-text/index.html` 优先于 SPA fallback。若不支持目录索引，改为输出 `dist/hash-text.html` 并配置 rewrite。

**关于 hydration 的重要说明（务实建议）：**
预渲染后，静态 HTML 里 `#root` 已有内容；而 `main.tsx` 用的是 `createRoot().render()`，React 挂载时会**清空并重建** `#root`——用户会看到一次极短的内容重绘。

- 这不影响 SEO（爬虫拿到的已经是完整 HTML），只是用户体验层面的小瑕疵；
- 因此**建议分两步**：先按上面实现（低风险，先拿到 SEO 收益），确认线上稳定后，再评估是否把 `createRoot` 换成 `hydrateRoot` 消除重绘。
- 若直接上 `hydrateRoot`：需保证预渲染语言与客户端 `resolveInitialLocale()` 结果一致，否则 hydration 不匹配会整树回退重渲。建议先做语言路由化（见 2.6），使 locale 由 URL 决定，hydration 才有确定性。

### 2.2 P0-2 结构化数据

**① 新增 `src/modules/seo/json-ld.tsx`**

```tsx
/** JSON-LD 载体。JSON-LD 允许出现在 body 任意位置，故无需提升到 head */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      // 内容为自建对象序列化，不含用户输入；仍统一转义 < 防止提前闭合
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  )
}
```

**② 新增 `src/modules/seo/schema.ts`（构造器，纯函数、可单测）**

```ts
import { siteConfig } from '@/config/site'

/** 站点级：WebSite + SearchAction（站内搜索框富结果） */
export function webSiteSchema(locale: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: siteConfig.name,
    url: `${siteConfig.siteUrl}/`,
    inLanguage: locale,
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${siteConfig.siteUrl}/?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  }
}

/** 品牌级：Organization */
export function organizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: siteConfig.name,
    url: `${siteConfig.siteUrl}/`,
    logo: `${siteConfig.siteUrl}${siteConfig.icons.android512}`,
    sameAs: [siteConfig.githubUrl],
  }
}

/** 工具页：SoftwareApplication；免费工具用 offer price 0 明确标注 */
export function softwareApplicationSchema(input: {
  name: string
  description: string
  url: string
  category: string
  keywords: readonly string[]
  locale: string
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: input.name,
    description: input.description,
    url: input.url,
    applicationCategory: 'DeveloperApplication',
    applicationSubCategory: input.category,
    operatingSystem: 'Any',
    browserRequirements: 'Requires JavaScript',
    inLanguage: input.locale,
    keywords: input.keywords.join(', '),
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'CNY' },
  }
}

/** 工具页：BreadcrumbList（与 UI 面包屑同源，避免两套） */
export function breadcrumbSchema(items: readonly { name: string; url: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  }
}

/** 内容层：FAQPage（与页面可见 FAQ 一一对应，禁止标记不可见内容） */
export function faqSchema(pairs: readonly { q: string; a: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: pairs.map((pair) => ({
      '@type': 'Question',
      name: pair.q,
      acceptedAnswer: { '@type': 'Answer', text: pair.a },
    })),
  }
}
```

**③ 接入位置**

- `BaseLayout`（或首页组件）注入 `webSiteSchema` + `organizationSchema`；
- `ToolLayout` 注入 `softwareApplicationSchema` + `breadcrumbSchema`；
- 内容层落地后追加 `faqSchema`（见 2.5）。

> 合规提醒：只标记页面上**真实可见**的内容。FAQ 标记与可见文案必须一致，否则属结构化数据滥用。

### 2.3 P0-5 增强 `DocumentMeta`

```tsx
import { siteConfig } from '@/config/site'

interface DocumentMetaProps {
  title: string
  description: string
  keywords?: string[]
  /** 相对路径（如 '/hash-text'），用于 canonical 与 og:url */
  path?: string
  type?: 'website' | 'article'
  noindex?: boolean
}

export function DocumentMeta({
  title,
  description,
  keywords,
  path = '/',
  type = 'website',
  noindex = false,
}: DocumentMetaProps) {
  const canonical = `${siteConfig.siteUrl}${path === '/' ? '/' : path.replace(/\/$/, '')}`
  const image = `${siteConfig.siteUrl}${siteConfig.icons.android512}`

  return (
    <>
      <title>{title}</title>
      <meta name="description" content={description} />
      {keywords && keywords.length > 0 && <meta name="keywords" content={keywords.join(', ')} />}
      <link rel="canonical" href={canonical} />
      {noindex && <meta name="robots" content="noindex, follow" />}

      <meta property="og:type" content={type} />
      <meta property="og:site_name" content={siteConfig.name} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonical} />
      <meta property="og:image" content={image} />
      <meta property="og:image:width" content="512" />
      <meta property="og:image:height" content="512" />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />
    </>
  )
}
```

同时：

- `ToolLayout` 传入 `path={tool.path}`；`/resume/:id` 编辑器路由传 `noindex`。
- **补一张真正的内容分享图**（`public/images/og-cover.png`，1200×630）。当前用的是 512×512 图标，带 `summary_large_image` 会在社交/AI 卡片里被裁切，效果差。

### 2.4 P0-4 修复 sitemap 生成

改造 `scripts/generate-sitemap.mjs`：

```js
// 1) lastmod 取工具定义里的 createdAt（真实内容时间），而非构建日
//    静态页无 createdAt，退化为构建日
const lastmodOf = (file) => {
  const content = readFileSync(path.join(root, file), 'utf8')
  return content.match(/createdAt:\s*['"](\d{4}-\d{2}-\d{2})['"]/)?.[1] ?? catchAllDate
}

// 2) 输出 changefreq / priority，明确抓取优先级
const STATIC_META = {
  '': { changefreq: 'daily', priority: '1.0' },
  about: { changefreq: 'monthly', priority: '0.3' },
}
const TOOL_META = { changefreq: 'weekly', priority: '0.8' }

const urlEntry = (p, lastmod) => {
  const meta = STATIC_META[p] ?? TOOL_META
  return `  <url>
    <loc>${siteUrl}/${p}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${meta.changefreq}</changefreq>
    <priority>${meta.priority}</priority>
  </url>`
}
```

并且——**这一步很关键**——生成的 `public/sitemap.xml` 与 `public/robots.txt` 应加入 `.gitignore`，不再提交：

```gitignore
# 构建生成物，由 prebuild 生成，避免提交后陈旧（当前线上就缺了 4 个工具）
/public/sitemap.xml
/public/robots.txt
```

> 这正是本次发现的 `docker-memo` / `maven-memo` / `nvm-memo` / `image-stack` 四条 URL 丢失的机制性原因：生成物被跟踪，改了工具没重新生成就提交了。**不修机制，下次还会漏。**
> 注意：EdgeOne 部署是从仓库构建还是直接发布 `dist/`？若是前者，`prebuild` 会正常生成；请确认 CI 走的是 `pnpm build` 而非提交产物。

### 2.5 P0-6 工具页内容层（真正的流量引擎）

**i18n 结构扩展**（`locales/{zh,en}/tools-<category>.json`）：

```json
"hash-text": {
  "title": "文本哈希计算",
  "description": "在线计算文本的 MD5、SHA1、SHA256、SHA512、SHA3 与 RIPEMD160 哈希值，支持自定义输入、实时输出与一键复制，全部在浏览器本地完成，不上传任何数据。",
  "intro": "需要快速算出字符串的 MD5 或 SHA256？把文本粘贴进输入框，选择算法即可实时得到哈希值。本工具支持六种主流算法，适合校验文件一致性、生成缓存键、比对口令摘要等场景；所有计算都在你的浏览器里完成，输入内容不会发送到任何服务器。",
  "howToTitle": "如何使用",
  "howTo": [
    "选择哈希算法（默认 SHA256，可按需切换 MD5 / SHA1 / SHA512 / SHA3 / RIPEMD160）",
    "在输入框中粘贴或输入待计算的文本，结果会实时更新",
    "点击输出框右侧的复制按钮，把哈希值复制到剪贴板"
  ],
  "faqTitle": "常见问题",
  "faq": [
    { "q": "MD5 和 SHA256 该选哪个？", "a": "MD5 计算更快、结果更短，但已被证实存在碰撞，仅适合做非安全场景的校验（如缓存键）；SHA256 抗碰撞能力强，是密码与签名场景的默认选择。" },
    { "q": "输入的文本会被上传吗？", "a": "不会。哈希计算完全在你的浏览器本地执行，页面不会向服务器发送任何输入内容。" },
    { "q": "为什么同一个文本每次算出来都一样？", "a": "哈希函数是确定性算法：相同输入必然得到相同输出，这正是它能用于校验数据的原理。" }
  ],
  "relatedTitle": "相关工具",
  "related": ["hmac-generator", "bcrypt", "encryption"]
}
```

**新增 `src/components/tool-seo-content.tsx`**（放在工具 UI **下方**，不影响主交互）：

```tsx
interface ToolSeoContentProps {
  intro: string
  howToTitle: string
  howTo: readonly string[]
  faqTitle: string
  faq: readonly { q: string; a: string }[]
  related: readonly { title: string; path: string }[]
}

/**
 * 工具页内容层：导语 + 如何使用 + 常见问题 + 相关工具。
 * 作用：给爬虫可检索的正文、命中长尾问句、并用 related 织出工具间内链图。
 */
export function ToolSeoContent({
  intro,
  howToTitle,
  howTo,
  faqTitle,
  faq,
  related,
}: ToolSeoContentProps) {
  return (
    <section className="mt-10 flex flex-col gap-8 border-t pt-8">
      <p className="text-muted-foreground leading-relaxed">{intro}</p>

      <div>
        <h2 className="text-lg font-semibold">{howToTitle}</h2>
        <ol className="text-muted-foreground mt-3 list-decimal space-y-2 pl-5 leading-relaxed">
          {howTo.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>

      <div>
        <h2 className="text-lg font-semibold">{faqTitle}</h2>
        <dl className="mt-3 flex flex-col gap-4">
          {faq.map((item) => (
            <div key={item.q}>
              <dt className="font-medium">{item.q}</dt>
              <dd className="text-muted-foreground mt-1 leading-relaxed">{item.a}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div>
        <h2 className="text-lg font-semibold">{relatedTitle}</h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {related.map((item) => (
            <li key={item.path}>
              <Link
                to={item.path}
                className="text-primary text-sm underline-offset-4 hover:underline"
              >
                {item.title}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
```

要点：

- **FAQ 用 `<dl>` 语义标签**，Google 的 FAQ 富结果解析对定义列表结构友好；
- **`related` 必须是真实的 `<Link>`（`<a>`）**，不能用 onClick 跳转——爬虫只能沿真实锚点爬；
- `related` 是**内链图的关键**：当前 56 个工具页之间几乎没有横向链接，爬虫只能靠首页/侧栏到达，导致"扁平但稀疏"的链接图，工具页之间无法传递权重。补上后形成语义簇（crypto 类互链、text 类互链）。
- FAQ/HowTo 文案必须与 `faqSchema` 输出一致。

**写作规范（保证质量而非堆量）：**

| 字段          | 字数            | 硬性要求                                                   |
| ------------- | --------------- | ---------------------------------------------------------- |
| `description` | 中文 70–120 字  | 含主关键词 + 一句价值点 + 「本地处理」信任点               |
| `intro`       | 中文 120–200 字 | 首句即主关键词；说明适用场景；不重复 description           |
| `howTo`       | 3–5 步          | 每步可执行、含具体参数名                                   |
| `faq`         | 3–5 条          | 至少 1 条命中真实搜索问句（用「怎么/为什么/能不能/哪个」） |
| `related`     | 3–5 个          | 必须同类目或强关联                                         |

**优先级建议**：先做搜索需求最大的 ~20 个工具（见 §3.2 词表），不要一次性铺 56 个导致文案质量塌方。

### 2.6 P0-3 语言路由化 + hreflang

这是唯一需要动架构的一项，建议**排在预渲染与内容层之后**独立实施。

**方案（推荐 A）：路径前缀 `/en/`**

| 方案                          | 优点                                   | 缺点                                               |
| ----------------------------- | -------------------------------------- | -------------------------------------------------- |
| A. 路径前缀 `/en/hash-text`   | 权重集中在同一域名；实施最直接         | 需改路由与 `changeLocale`                          |
| B. 子域 `en.tool.mmzhiku.xyz` | 可用同构建产物按 `base` 部署；隔离清晰 | 权重分散，需分别运营                               |
| C. 参数 `?lang=en`            | 几乎零改动                             | **不推荐**：参数 URL 收录差，且易与 canonical 冲突 |

方案 A 要点：

1. `router.tsx` 的 `BaseLayout` 下加 `path: 'en'` 分支，所有子路由复制一份；或引入 `/:locale?` 前缀层（需注意与现有 56 条工具路径的匹配优先级，避免 `/:locale` 吞掉工具名——**这是本方案最大的坑**，务必用显式 `en` 段而非可选参数，或维护一份 locale 白名单精确匹配）。
2. `resolveInitialLocale()` 改为**优先读 URL**，其次 localStorage，最后浏览器语言；`changeLocale()` 改为 `navigate()` 到对应语言路径（保持用户在同一个页面上）。
3. `index.html` 的 `lang` 由运行时同步：`document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en'`。
4. `DocumentMeta` 输出双向 hreflang（含 `x-default`）：

```tsx
<link rel="alternate" hrefLang="zh-CN" href={`${siteConfig.siteUrl}${zhPath}`} />
<link rel="alternate" hrefLang="en" href={`${siteConfig.siteUrl}/en${enPath}`} />
<link rel="alternate" hrefLang="x-default" href={`${siteConfig.siteUrl}${zhPath}`} />
```

5. sitemap 同时收录中英两套 URL，并在 `urlset` 上声明 `xmlns:xhtml` 与 `<xhtml:link rel="alternate" hreflang="...">` 互指。
6. 预渲染脚本按两个 locale 各跑一遍（`/` 与 `/en/` 全量）。

### 2.7 P1 快速修复

**`/resume/:id` 收敛** —— `robots.txt` 增加：

```
# 简历编辑器是应用态工作台，含用户数据、无搜索价值
Disallow: /resume/
```

并在编辑器路由的 `DocumentMeta` 传 `noindex`。

**首页 title 优化** —— 当前 `MmzMing的工具箱 - 在线工具箱` 无搜索意图词。建议改为「在线工具箱 - 80+ 免费开发者工具（加密/转换/编码）| MmzMing」，即**品类词 + 数量背书 + 细分类目 + 品牌**。60 字符内（中文按 2 字符计约 30 汉字上限）。

**Core Web Vitals** ——

1. 预渲染后 LCP 元素由「等 JS」变为「HTML 已就位」，是最大改善；
2. 评估 EdgeOne 的 HTML 缓存策略，把 `max-age=0` 调为 `max-age=0, s-maxage=600, stale-while-revalidate=86400`（CDN 边缘缓存，回源频率下降）；
3. `main.tsx` 中 `await initI18n()` 阻塞了首屏渲染——预渲染后用户可见内容已存在，但**仍需确认**语言包加载不再成为交互阻塞；长期看语言包应按语言拆分并按需加载，不要中英全量首屏加载（当前 `initI18n` 里 `Promise.all([loadLocale(locale), loadLocale(other)])` **两种语言全量加载**，这是为命令面板跨语言搜索做的取舍，代价被首屏承担了）。

**字体子集化** —— `public/fonts/` 的 8–17 MB TTF/OTF 转为 `woff2` 子集（用 `pyftsubset`/`fontmin`，只保留 GB2312 常用字 + 已用标点），单文件可从 16.5 MB 降到 1–2 MB。注意：`resume` 与 `music-to-video` 需要**完整字表**才能渲染任意用户文本，因此这两个工具应保留完整字体但**改为首次选用时才按需加载**，不要放在首屏可达路径上。

---

## 3. 关键词与内容策略

### 3.1 策略逻辑

工具站的搜索模型是「**一个工具页 = 一个搜索需求 = 一个落地页**」，天然适合做长尾。你已经有 56 个落地页，但它们现在：

- 没有正文 → 无法匹配长尾
- 没有 FAQ → 无法命中问句、无法进 AI 摘要
- 没有互链 → 无法形成主题簇、无法传递权重

因此策略不是"再发 100 篇文章"，而是**把已有 56 个页面的"内容深度"补齐**，让每页覆盖「功能词 → 场景词 → 问句词」三层。

### 3.2 关键词映射表（Top 20 工具，按预期搜索需求排序）

> ⚠️ 搜索量为**方向性判断**，需用百度指数 / 5118 / Ahrefs 校准后再定优先级。这里给出的是**意图结构**，比数量更有用。

| 工具                                | 主关键词（功能词）                | 长尾场景词                       | 问句词（FAQ 用）                 | 意图                  |
| ----------------------------------- | --------------------------------- | -------------------------------- | -------------------------------- | --------------------- |
| `/hash-text`                        | md5加密在线、sha256在线计算       | 文件校验哈希、字符串哈希转换     | md5和sha256区别、md5还安全吗     | 信息+工具             |
| `/qr-code`                          | 二维码生成器、在线二维码制作      | 文本转二维码、链接生成二维码     | 二维码能放多少字、二维码会过期吗 | 交易+工具             |
| `/wifi-qr-code-generator`           | wifi二维码生成                    | 扫码连wifi、wifi密码二维码       | wifi二维码怎么扫、安卓能不能扫   | 交易+工具             |
| `/id-generator`                     | uuid生成器、ulid生成器            | 批量生成uuid v7、uuid转ulid      | uuid和guid区别、ulid和uuid区别   | 工具                  |
| `/chmod-calculator`                 | chmod权限计算器、linux权限计算    | 755权限、文件权限对照表          | 755和777区别、chmod怎么用        | 信息+工具             |
| `/crontab-generator`                | crontab表达式生成、定时任务表达式 | cron表达式在线解析、每天凌晨执行 | cron表达式怎么写、0点怎么表示    | 信息+工具             |
| `/unit-converter`                   | 单位换算、在线单位转换            | 长度单位换算表、重量换算         | 1英寸等于多少厘米                | 工具                  |
| `/image-compressor`                 | 图片压缩、在线图片压缩            | 图片无损压缩、jpg压缩到100k      | 怎么压缩图片不失真               | 交易+工具             |
| `/json`（format-converter）         | json格式化、json在线格式化        | json校验、json转yaml             | json格式错误怎么查               | 工具                  |
| `/encoder-decoder`                  | base64编码解码、url编码           | base64转图片、中文转base64       | base64是什么、base64会变大吗     | 信息+工具             |
| `/timestamp`（date-time-converter） | 时间戳转换、unix时间戳在线        | 时间戳转日期、毫秒时间戳         | 时间戳10位和13位区别             | 工具                  |
| `/regex-memo`                       | 正则表达式大全、正则在线测试      | 常用正则表达式、手机号正则       | 正则怎么匹配中文                 | 信息                  |
| `/color-converter`                  | 颜色转换、hex转rgb                | 颜色代码查询、rgb转十六进制      | 怎么把rgb换成hex                 | 工具                  |
| `/text-diff`                        | 文本对比、在线diff工具            | 代码对比、文件差异对比           | 怎么快速对比两段文字             | 工具                  |
| `/token-generator`                  | 随机密码生成器、token生成         | 强密码生成、随机字符串           | 多长的密码才安全                 | 交易+工具             |
| `/password-strength-analyser`       | 密码强度检测                      | 密码安全检测、弱密码查询         | 我的密码够安全吗                 | 工具                  |
| `/image-to-beads`                   | 拼豆图纸生成、像素画生成器        | 图片转拼豆、照片转像素图         | 拼豆图纸怎么画                   | 交易+工具（差异化强） |
| `/social-insurance-calculator`      | 社保计算器、五险一金计算          | 社保缴费基数计算、到手工资       | 社保要交多少年                   | 交易+工具             |
| `/chinese-kinship-calculator`       | 亲戚称呼计算器                    | 亲戚关系称呼、怎么称呼           | 爸爸的哥哥叫什么                 | 工具（易出圈）        |

**差异化优先项**：`image-to-beads`、`chinese-kinship-calculator`、`fortune-draw`、`photo-cheatsheet` 这类**垂直小众工具**，竞争度远低于「md5加密」，是**最容易拿到首页排名**的切入点。建议把它们作为第一波内容深化的对象——先赢容易赢的。

### 3.3 内容簇与内链架构

```
首页（品类词：在线工具箱 / 免费开发者工具）
   │
   ├─ 分类聚合页 /category/crypto        ← 新增，做品类词「加密解密工具」
   │     ├─ /hash-text       ←related→ /hmac-generator, /bcrypt
   │     ├─ /hmac-generator
   │     └─ /bcrypt
   ├─ 分类聚合页 /category/images        ← 「图片处理工具在线」
   │     └─ /image-compressor ←related→ /image-to-beads
   └─ ...（共 9 个分类页）
```

三件事：

1. **新增 9 个分类聚合页**：`/category/<key>`，title 如「加密与编码工具 - 在线免费，本地处理 | MmzMing」，正文用分类描述 + 该分类工具列表 + 该分类常见问题。这是**成本最低的新增可索引页面**（9 个页面的内容可复用现有 `categories.ts` 的分类名与工具清单），且天然成为工具页的父节点，把扁平结构变成两级。
2. **工具页 `related` 互链**（见 2.5），形成语义簇。
3. **首页**增加指向 9 个分类页的可见链接区块（当前首页是工具卡片墙，需确认分类入口是否为真实 `<a>`）。

### 3.4 内容质量红线（E-E-A-T）

- 工具站的可信度来源是 **"本地处理、不上传数据"**——这句应当出现在每个工具页的导语里（现状仅在首页有），它是转化与信任的核心差异点；
- 全站已有 GitHub 开源仓库与 MIT 协议，应在页面可见位置标注（作者/来源可信度信号）；
- About 页应包含：谁做的、为什么做、数据如何处理、联系方式——目前 about 页应是全站最薄页面（sitemap priority 只给 0.3），补齐后可支撑 E-E-A-T；
- 禁止：为凑字数复制粘贴、关键词堆砌（`keywords` 标签本已无排名作用，仅保留作辅助信号）。

---

## 4. 权威度与外链建设

当前站点**几乎无外链资产**（`sameAs` 仅一个 GitHub）。工具站的外链有天然优势：**工具本身是可链接资产（linkable asset）**。

| 途径                  | 具体做法                                                                                                                                               | 预期                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------- |
| 开源仓库              | GitHub 仓库补齐 `topics`（`developer-tools` `online-tools` `privacy-first` `self-hosted` 等）；README 顶部放站点链接与截图；仓库有 star 后自然产生外链 | 持续被动              |
| Awesome 列表          | 向 `awesome-selfhosted`、`awesome-devtools`、`awesome-web-tools` 等提交 PR（注意各仓库的收录标准，不要滥投）                                           | 高权重单链            |
| 中文技术社区          | 掘金 / V2EX / 少数派 / 即刻 发布「我做了个把 56 个工具全放在浏览器本地跑的工具箱」**真实故事型内容**（技术选型、隐私取舍、踩坑），而非硬广             | 高质量引荐流量 + 外链 |
| 资源页收录            | 提交到国内工具导航站、Chrome 插件/书签类站点目录                                                                                                       | 基础外链底            |
| Unlinked mention 回收 | 定期搜 `"tool.mmzhiku.xyz"`（不带 link 的提及），联系补链                                                                                              | 低成本                |
| 差异化工具出圈        | `image-to-beads`（拼豆图纸）、`chinese-kinship-calculator`（亲戚称呼）这类工具有天然的社交传播性，值得单独做小红书/B站/贴吧内容                        | 破圈流量              |

**禁止**（触碰即可能是惩罚，不做）：购买链接、链接农场、目录刷量、隐藏文字、doorway page。

---

## 5. 度量体系与 KPI

### 5.1 先行：把测量接上（本周就做）

| 平台                  | 动作                                                                                                                               | 备注                                     |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Google Search Console | 验证域名属性 → 提交 sitemap → 用「网址检查」逐模板看**渲染后 HTML**                                                                | 这是验证预渲染是否生效最直接的手段       |
| Bing Webmaster Tools  | 同上，可导入 GSC 数据                                                                                                              | 覆盖面                                   |
| 百度搜索资源平台      | 验证站点 → 提交 sitemap → 开启「动态页面抓取优化」                                                                                 | 中文主渠道，**必须做**；同时提交移动适配 |
| 隐私友好分析          | 因站点承诺"不上传数据"，建议用自建/隐私友好的方案（如 Plausible/Umami 自部署），或在隐私政策中明确披露；不要因分析工具破坏信任定位 | 需在隐私说明中告知                       |

> 先用 `curl` 做**基线记录**：把 56 条 URL 当前的原始 HTML `<title>` 抓一遍存证，改造后对比，证明修复生效。这是最有说服力的验收证据。

### 5.2 KPI（建议按季度考核）

| 指标                           | 当前基线                               | 3 个月目标                    | 6 个月目标           |
| ------------------------------ | -------------------------------------- | ----------------------------- | -------------------- |
| 被索引的有效页面数             | 未知（大量页面主题重复，预计覆盖很低） | ≥ 60 页（56 工具 + 9 分类页） | ≥ 120 页（含英文版） |
| 有独立标题/描述/正文的页面占比 | ~0%                                    | **100%**                      | 100%                 |
| 自然搜索周点击（GSC，非品牌）  | 需接 GSC 确认                          | 建立基线并环比增长            | 相对基线 +150%       |
| 目标词进入 Top 3 的比例        | —                                      | 10%                           | 30%                  |
| 结构化数据覆盖页面数           | 0                                      | 66 页                         | 130+ 页              |
| Core Web Vitals 全绿（移动端） | 未测（CSR 下 LCP 风险高）              | 达标                          | 达标                 |
| 有效引用域（外链）             | 极少                                   | +15                           | +40                  |
| 英文自然流量占比               | 0%                                     | 开始有数据                    | 20%+                 |

**关于预期管理（务必对齐）：** SEO 是复利曲线，不是开关。预渲染与结构化数据带来的**收录改善**在 2–4 周内可见；**排名与流量**通常需要 2–3 个月才会出现清晰趋势，竞争词更久。任何承诺"一周上首页"的方案都是在骗你。

---

## 6. 90 天路线图

### 阶段一（第 1–2 周）：**让搜索引擎能看见** —— 解锁阶段

- [ ] `puppeteer` 预渲染脚本 + 接入 `build`，验证 `dist/hash-text/index.html` 含正确标题
- [ ] 增强 `DocumentMeta`（canonical / og:image / twitter / robots）
- [ ] 新增 `json-ld.tsx` + `schema.ts`，接入 WebSite / Organization / SoftwareApplication / BreadcrumbList
- [ ] 修复 `generate-sitemap.mjs`（lastmod 取 createdAt、补 changefreq/priority、补回 4 条丢失 URL）
- [ ] `public/sitemap.xml`、`public/robots.txt` 加入 `.gitignore`
- [ ] `robots.txt` 收敛 `/resume/`；编辑器路由加 `noindex`
- [ ] 首页 title 重写；补 1200×630 分享图
- [ ] 接入 GSC / Bing / 百度资源平台，提交 sitemap

**验收**：`curl` 抓 10 条不同 URL，`<title>` 各不相同且为工具自身标题；GSC「网址检查」显示渲染后关键内容一致。

### 阶段二（第 3–6 周）：**让页面值得被排名** —— 内容阶段

- [ ] i18n 结构扩展（`intro` / `howTo` / `faq` / `related`）
- [ ] 新增 `ToolSeoContent` 组件，接入 `ToolLayout`
- [ ] 先完成 **20 个高优先工具**（含 4 个差异化小众工具）的中英双语内容
- [ ] 新增 9 个分类聚合页 `/category/<key>` 并接入首页入口
- [ ] 完成工具间 `related` 互链网
- [ ] 同步输出 FAQPage / HowTo 结构化数据

**验收**：任取一个工具页，关闭浏览器 JS 后仍能看到标题、导语、操作步骤、FAQ 与相关工具链接。

### 阶段三（第 7–10 周）：**扩大战场** —— 语言与权威阶段

- [ ] 语言路由化（`/en/…`）+ hreflang + `html lang` 同步 + 英文预渲染
- [ ] 英文内容补齐（英文优先做开发者向工具：hash / uuid / json / cron / regex / chmod）
- [ ] 外链启动：GitHub topics + awesome 列表 PR + 社区故事型内容 1–2 篇
- [ ] Core Web Vitals 优化：EdgeOne 缓存策略、语言包按需加载、CJK 字体 woff2 子集化 + 按需加载
- [ ] 剩余 36 个工具的内容补齐（按 GSC 实际曝光数据排序，优先做已有点击/曝光的）

### 阶段四（第 11–12 周）：**度量与迭代**

- [ ] GSC 数据复盘：哪些查询已进 Top 20（低垂果实，优先优化 4–20 位）、哪些页面未被收录（逐个查原因）
- [ ] 补充被忽略的 PAA 问句进 FAQ
- [ ] 建立月度 SEO 看板（GSC API + 排名追踪）
- [ ] 制定下一季度内容选题（依据 Gap 分析：竞品有排名而你没有的词）

---

## 7. 本周立即执行清单（可复制到任务板）

```
P0  预渲染脚本落地并验证                    [1.5d]  最大杠杆，先做这个
P0  DocumentMeta 增强（canonical/og/twitter）[0.5d]  低风险高收益
P0  JSON-LD（4 类 schema）                   [0.5d]
P0  sitemap 机制修复 + 4 条 URL 补回         [0.5d]
P0  robots 收敛 /resume/ + 编辑器 noindex    [0.2d]
P1  首页 title 重写 + 1200x630 分享图        [0.5d]
P0  GSC / Bing / 百度资源平台接入与提交      [0.5d]
--- 以上约 4 人日，完成后站点从「不被看见」变为「可被正确索引」---
P1  20 个高优先工具的 intro/howTo/faq/related [5–8d]  内容阶段，按 GSC 数据排序
P1  9 个分类聚合页                            [2d]
P2  语言路由化 + hreflang                     [3–5d]  架构调整，独立分支
```

---

## 8. 外部依据（搜索引擎渲染能力现状）

- **Google**：对 JS 页面采用两阶段索引——先抓原始 HTML，页面进入渲染队列（headless Chromium）后于「第二波」再提取内容；渲染可能耗时秒级到天级，且会因 JS 报错、资源超时、体积过大而失败。SSR/SSG 页面在第一阶段即可完成内容提取与索引。
- **百度**：抓取与渲染分离，渲染能力显著低于真实浏览器；CSR 页面进入渲染队列后排期可能数小时至数天，正文与内链存在漏抓风险。百度官方文档多次强调"服务端输出完整 HTML 是降低索引风险的最佳实践"。
- **AI 爬虫（ChatGPT / Perplexity / Gemini 等）**：**绝大多数不执行 JavaScript**，只读取原始 HTML，没有渲染阶段。这意味着纯 CSR 站点在这些渠道**完全不可见**——这是 2026 年新增的、且增长最快的曝光渠道。
- 行业结论一致：**CSR 是搜索表现最差的渲染方式**；对于内容不随请求变化的静态工具站，**SSG/预渲染是性价比最优解**。

---

_文档维护：本策略为基于 2026-09-26 代码与线上状态的快照。执行阶段一后应重新体检并更新 §1；KPI 基线需在 GSC 接入后回填。_
