# SEO 工作区

| 文件                               | 说明                                                                |
| ---------------------------------- | ------------------------------------------------------------------- |
| [SEO优化策略.md](./SEO优化策略.md) | 全站 SEO 体检 + 修复方案 + 内容与关键词策略 + 90 天路线图（主文档） |

## 本次体检结论（2026-09-26）

站点 `https://tool.mmzhiku.xyz` 自然搜索流量不足的**根因不是优化不足，而是纯 CSR 架构导致 56 个工具页对爬虫不可见**：

- `dist/` 仅 1 个 `index.html`；线上 `/hash-text` 原始 HTML 返回的 `<title>` 是**首页标题**，`<meta description>` 也是首页的 → 全站页面在爬虫眼里标题重复、正文空白。
- 全站无任何 JSON-LD 结构化数据。
- 语言切换只改 localStorage（`modules/i18n/index.ts`），无 `/en/` 路由；`<html lang>` 也不同步 → 英文版不可收录，且英文界面下仍声明 `zh-CN`（错误信号）。

## 已落地（2026-09-26，代码改动待提交）

- `DocumentMeta` 改为对 head **原位 upsert**：canonical / og:type·site_name·locale·url·image / twitter:card / robots(noindex) 全部补齐；不用 React 19 声明式提升，是因为静态壳已有一份取值，两条 href 不同的 canonical 会被 Google 一概忽略。
- 静态 `index.html` 由 `vite.config.ts` 注入首页那套 og + `WebSite`/`Organization` JSON-LD 数据块 → 不执行 JS 的爬虫（百度、AI 抓取）终于有可读内容。
- 新增 `modules/seo/schema.ts`（WebApplication / BreadcrumbList / 站点实体，含 `serializeJsonLd` 的 `<` 转义）与 `json-ld.tsx`，工具页与站点级结构化数据上线；附 `src/test/modules/seo/schema.test.ts`。
- sitemap 的 `lastmod` 改用各工具 `createdAt`（首页/关于页取最近上架日），不再全站同一构建日；不写 `changefreq`/`priority`（Google 声明忽略）。
- `changeLocale` 与初始化都会同步 `<html lang>`（zh-CN / en）。
- 新增 `scripts/check-tool-seo-keys.mjs` 并入 `pnpm test`：断言目录名 = name = path，且每个工具中英 `title`/`description` 齐全（缺键会把 `bcrypt.title` 这种原始键名渲染进 `<title>`）。
- 首页 title/description 换成可检索文案（新增 `home.metaDescription` 中英键），品类词入 title；`404` 页加 `noindex` 并清除 canonical。

## 仍未做（按性价比排序）

1. **构建期预渲染**——最大杠杆，但需引入 Puppeteer（与 AGENTS.md §12「优先零依赖」冲突），须先确认。
2. **托管层 301 与真 404**——线上实测：未知路径返回 200（Soft 404）、`/hash-text/` 与 `/hash-text` 同页两份、`redirectFrom` 只是客户端跳转不传权重。需知实际托管（当前线上是 EdgeOne，仓库里 nginx/vercel/netlify 三份配置未必在用）。
3. **英文路由化 + hreflang**——依赖预渲染先落地。
4. **工具页内容层**（导语/如何使用/FAQ/相关工具内链）。
5. **1200×630 品牌分享图**——现用 512×512 图标，故 `twitter:card` 声明为 `summary`；补横图后改 `summary_large_image`。

## 已核验的健康项

robots.txt 放行且声明 Sitemap；线上 sitemap 58 条 URL 与注册工具一一对应；`public/sitemap.xml`、`public/robots.txt` 均不入库（`.gitignore`），由 prebuild 生成；56 个工具的中双语 title/description 零缺失。

主文档含后续步骤的可落地代码：预渲染脚本、`ToolSeoContent` 组件、i18n 文案结构。
