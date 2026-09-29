# SEO 与 GEO 策略

> 站点：https://tool.mmzhiku.xyz ｜ 技术栈：React 19 + Vite 8 + react-router v8（纯前端静态站）
> 范围：48 个工具页 + 首页 + 关于页，9 个分类；中英双语界面。
> 本文是收录与检索可见性的现行规范：架构约束、页面规范、内容规范、门禁与验收。

---

## 1. 渠道前提：谁能看见什么

三类抓取方的渲染能力不同，决定了整站的输出方式。

| 抓取方                                   | 是否执行 JS                                        | 只读原始 HTML 时能看到            |
| ---------------------------------------- | -------------------------------------------------- | --------------------------------- |
| Googlebot                                | 会（第二波渲染队列，秒～天级延迟，可能失败）       | 静态壳里的 TDK、正文、结构化数据  |
| 百度蜘蛛                                 | 能力远低于真实浏览器，抓取与渲染分离，排队数小时起 | 同上                              |
| ChatGPT / Perplexity / Gemini 等 AI 爬虫 | **不执行 JS**，没有渲染阶段                        | 同上（这就是 GEO 的全部可争取面） |

**结论**：页面主题、正文与内链必须在**构建期就写进 HTML**，不能依赖 React 挂载后注入。
所有「等 JS 跑起来才有内容」的设计，在百度与 AI 渠道等于零。

---

## 2. 收录架构：构建期静态壳 + 运行时接管

```
src/config/site.ts ─
src/tools/*/*/index.ts（path / keywords / createdAt / immersive / wide）
src/modules/i18n/locales/{zh,en}/tools-<分类>.json（title / description）
                    │  scripts/lib/site-routes.mjs 统一枚举（单一路由来源）
                    ├─→ generate-sitemap.mjs  → public/{sitemap.xml,robots.txt}
                    ├─→ generate-llms.mjs     → public/{llms.txt,llms-full.txt}
                    └─→ modules/seo/static-head.ts（head 生成器）
                          ├─ vite.config.ts：注入首页静态壳（dev 与 build 同一钩子）
                          └─ prerender-shells.mjs：build 末尾按路由改写 → dist/<路由>/index.html
```

| 层次               | 负责什么                                                                                                                                                | 关键文件                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 构建期静态壳       | 每条路由自己的 title/description/keywords/canonical/OG/Twitter/robots、`WebApplication`+`BreadcrumbList` 数据块、`#root` 内的页头镜像与源码里的目录内链 | `scripts/prerender-shells.mjs`                 |
| 运行时接管         | 语言切换后按当前界面语言重写同一批标签与数据块                                                                                                          | `modules/seo/document-meta.tsx`、`json-ld.tsx` |
| head 单一来源      | 两层共用一个生成器，避免两套 TDK 规则漂移                                                                                                               | `modules/seo/static-head.ts`                   |
| 路由与文案单一来源 | sitemap / llms / 静态壳三处 URL 与文案必须同源                                                                                                          | `scripts/lib/site-routes.mjs`                  |

约束与理由：

- **不引入 Puppeteer/浏览器渲染**。静态壳要落盘的只有 TDK 与一段与真实页头同构的正文，全部来自
  i18n 与工具定义这些静态数据；跑浏览器只是把同样的东西再算一遍，还要背 Chromium 依赖（AGENTS.md §12）。
- **可见的只有页头镜像，长清单进 `<noscript>`**。#root 里只放与最终页面同构的标题区（首页 Hero、
  工具页 H1 + 一句话描述）；首页那 48 条分类内链写在 `#root` 外的 `<noscript>` 里。
  脚本开启时浏览器不渲染 noscript，用户在 React 挂载前看到的就是一屏标题区而不是一整屏纯文字，
  而按源码解析的爬虫（百度、AI 抓取）照样读到这些带锚文本的内链。
- **`DocumentMeta` 对 head 做原位 upsert**，不用 React 19 的声明式标签提升：静态壳里已有一份同名标签，
  再插入就会留下两条 href 不同的 canonical，而 Google 对冲突 canonical 是一概忽略。
- **运行时 `JsonLd` 挂载时移除静态块**（`script[data-seo-static]`）：静态壳固定是中文，切到英文后
  两份同 URL 的声明会互相矛盾。
- **宿主前提**：静态壳要生效，托管必须**先查文件再 rewrite**。nginx `try_files $uri $uri/ /index.html`、
  Vercel、Netlify 都满足；只配了 SPA fallback 的宿主会把请求退回首页壳，此时各页 TDK 又变成同一份
  （见 §15 验收）。

---

## 3. URL 与规范化

- 一个工具 = 一条路由 = 一个落地页；**目录名 = `name` = `path` 去斜杠**，由 `check-tool-seo-keys.mjs` 强制。
- 只有根路径保留结尾斜杠，其余一律去尾斜杠（`absoluteUrl()`）——`/tool` 与 `/tool/'` 算两个可索引页面。
- 每条工具页输出指向自身的 `rel=canonical`；404 页不带 canonical 且 `noindex, follow`。
- 应用态页面（`/resume/:id` 编辑器）用运行时 `noindex`，**不在 robots 里 Disallow**：抓取被挡住后
  爬虫看不到页面里的 noindex，反而可能凭外链把只带 URL 的空页收进索引。
- 全小写、连字符分隔、无查询参数、无日期段。
- 旧路径迁移用 `redirectFrom`，但客户端跳转不传权重；真 301 属于托管层职责（见 §15）。

---

## 4. 页面级规范（TDK 与结构）

| 元素          | 规范                                                                                                                                                        |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<title>`     | `工具名 · 品牌`。中文整条 ≤ 30 汉字，英文整条 ≤ 60 字符。**品牌后缀取 `common.siteName`**，英文页用 `MmzMing's Toolbox`，禁止在英文标题里拼中文品牌         |
| `description` | 中文 40–100 字、英文 70–160 字符；结构 = 做什么 + 关键能力枚举 + 信任点（本地处理 / 免费 / 无需注册）。低于这个量级会被搜索引擎改写成自动摘要，超出会被截断 |
| `keywords`    | 取工具定义里的 `keywords`（中英混合）。对排名无作用，只作为辅助信号与 AI 抽取的别名表，禁止堆砌                                                             |
| `robots`      | 默认 `index, follow`；应用态页 `noindex, follow`（保留链接权重传递）                                                                                        |
| H1            | 每页恰好一个，等于工具名。整页式（`immersive`）工具没有可见页头，由 `ToolLayout` 输出 `sr-only` H1，工具自带头部一律用 H2                                   |
| H2            | 首页与关于页的分区标题；工具页不额外加 H2（见 §8），标题层级不跳级                                                                                          |
| 正文          | 工具页可见正文就是页头那一句话描述，版面留给工具本身；可检索正文由构建期写进 HTML 源码（§8）；列表渲染带稳定 key，图片/图标有可读名称                       |

首页 title 承载品类词（「免费在线工具箱与开发者实用工具集」）；关于页 title 已含品牌名，因此不追加后缀。

---

## 5. 结构化数据

`src/modules/seo/schema.ts` 是唯一出口，序列化为 `<script type="application/ld+json">`。

| 类型             | 出现位置 | 要点                                                                                       |
| ---------------- | -------- | ------------------------------------------------------------------------------------------ |
| `WebSite`        | 全站     | 不带 `SearchAction`——站内搜索是本地模糊匹配，没有可提交的 `/search?q=` URL                 |
| `Organization`   | 全站     | `sameAs` 指向 GitHub 与博客，是知识面板与实体归一的基础                                    |
| `WebApplication` | 工具页   | `applicationCategory: UtilitiesApplication`、`offers.price = 0`、`isPartOf` 引用站点 `@id` |
| `BreadcrumbList` | 工具页   | 与 UI 面包屑同源，两级（首页 → 工具）                                                      |

只标页面上真实可见的内容：`FAQPage` / `HowTo` 这类要求"问答与步骤在页面里看得见"的类型，
当前不输出（工具页没有可见问答，见 §8）。

硬性规则：**每个节点必须自带 `@context: https://schema.org`**。缺它的 JSON-LD 不是声明，Google 富结果检测
与 AI 引擎会整条丢弃——`schema.test.ts` 里有专门断言，新增构造器不能漏。

---

## 6. 分享卡片

- `og:type/site_name/locale/title/description/url/image` + `twitter:card/title/description/image` 全站齐备。
- 全站共用一张分享图 `public/images/og-image.png`（1200×630，源文件 `og-image.svg`），
  `twitter:card = summary_large_image`。**单张控制在 100 KB 以内**：QQ / 微信这类抓取器对
  `og:image` 有体积与超时阈值，图太重就"只剩标题没图"，所以底图刻意只用纯色分带——
  渐变在 1200×630 上的抖动编码会把 PNG 推到几百 KB。
- 必须是**位图**：Facebook / Twitter / QQ 抓取器都不接受 SVG；**也不能用 WebP**，
  国内抓取器对 WebP 渲染不稳定。
- 改 `og-image.svg` 后需重新光栅化同名 PNG（浏览器内 canvas 导出 1200×630，
  尺寸不受视口与 DPR 影响）。
- `og:locale` 随界面语言取 `zh_CN` / `en_US`。
- **QQ / QQ 空间的抓取器读 microdata 而不是 `og:*`**，因此 head 里另有
  `<meta itemprop="name|image|description">` 三条，取值与 `og:title` / `og:image` / `og:description`
  严格同源；运行时 `DocumentMeta` 同样 upsert 它们，切语言不会留下另一种语言的分享文案。
- 边界要说清：这三条只保证**被腾讯抓到时字段是对的**。QQ 聊天里粘贴纯文本链接要不要展开成卡片、
  对新域名与未备案域名如何处置，都由腾讯侧策略决定，代码无法保证。
- **不做平台专属分享组件**。实测 `connect.qq.com/widget/shareqq/index.html?…` 分享出去的是该组件
  自己的跳转长链，卡片标题成了「发送给QQ好友和群组」而不是本站标题，手机上还要靠扫码完成，
  体验是负的；QQ 内置浏览器另有一层域名拦截（命中时提示「如需浏览，请使用浏览器访问」），
  分享做得再对也打不开。
- 工具页页头收藏星标旁因此放的是**复制页面链接**按钮（`components/copy-link-button.tsx`）：
  复制的是 canonical 形态的绝对地址（与 og:url 同源），tooltip 直接显示将要复制的链接，
  用户拿到后自行粘到任何平台。OG 与 microdata 仍保留——它们在 Telegram / X / Discord / 飞书 /
  钉钉 / AI 引擎这些**确实读 og:\* 且不拦域名**的渠道里有效。
- 分享文案与可见内容严格同源：三条取值都来自各页 `DocumentMeta` / 静态壳用的同一份 title 与 description。

---

## 7. GEO：让 AI 引擎能引用

GEO 与 SEO 的分歧只有一处——**AI 引擎不执行 JS，也不看渲染后 DOM**。所以争取的不是排名，而是
「原始 HTML 里有没有可抽取的事实」。

1. **`/llms.txt`**：按分类的站点索引，每行 `- [工具名](绝对 URL): 说明`，另有 Key Facts 段写明
   本地计算、免费开源、双语、无账号等可被直接引用的结论。**`/llms-full.txt`** 是详版：中英名称、
   双语说明、搜索关键词、上架日期。两者由 `scripts/generate-llms.mjs` 扫描工具注册表生成，
   新增工具自动进列表，不入库、不手写。
2. **robots.txt 指路**：一行注释给出 llms.txt 绝对地址（robots 无 llms 官方字段，注释是给抓取方与运维看的）。
3. **静态正文**：每条工具页的 HTML 源码里有 H1、一句话描述与回首页的链接；首页源码里有 48 条
   带锚文本的分类内链（在 `<noscript>` 里，源码可读、浏览器不渲染）。这是 AI 引擎能读到的
   「页面说了什么」的主体。
4. **可抽取的清单**：`llms-full.txt` 里每个工具的中英名称、双语说明与搜索关键词，是 AI 引擎
   最容易直接引用的结构化事实。
5. **事实一致性**：文案里「全部本地处理、不上传数据」这类声明必须与实现一致，例外（IP 查询、
   可选 AI、在线曲库）在首页副标题与关于页明示。AI 引擎会把矛盾当噪声。

---

## 8. 工具页正文边界

工具页的主体是工具本身，**不铺「导语 / 如何使用 / 常见问题」这类长文内容层**：阅读区只保留 H1
与一句话描述，其余版面交给交互控件。

- 可检索正文由构建期写进 HTML 源码：每条工具页有 H1 + 描述 + 回首页链接，首页源码有 48 条带锚文本
  的分类内链（在 `<noscript>` 里，浏览器开着 JS 时不渲染）。
- 因此不输出 `FAQPage`：结构化数据只能标页面上真实可见的内容，工具页没有可见问答就不声明。
- 长尾与问句覆盖靠三处承载，不靠正文堆字：`title` / `description` 里的关键词（§4）、
  `llms.txt` 与 `llms-full.txt` 的中英说明与搜索关键词（§7）、以及分类聚合页（§9 规划）。
- 要补正文必须先定呈现方式（折叠区还是独立文档页），确认后再动 `ToolLayout`。

---

## 9. 内链与内容簇

```
首页（品类词，静态 HTML 内含 9 个分类 × 48 条工具内链）
   └─ 工具页 ──▶ 侧栏同类工具 + 面包屑回首页（横向互链见下）
```

- 首页是权重最高的页面，静态壳源码里的分类清单 + 锚文本是全站内链图的根。
- 工具页之间的横向链接目前只有侧栏（同分类并列）与面包屑；正文区不放相关工具链接（§8）。
- 规划中的增强：**9 个分类聚合页** `/category/<key>`（title 承载「加密解密工具」「图片处理工具在线」这类
  品类词，正文复用 `categories.ts` 与工具清单），把一级结构变成两级。这是成本最低的新增可索引页面。

---

## 10. 双语与 hreflang

现状：语言只存 localStorage，URL 不区分语言，`<html lang>` 与 `og:locale` 随界面语言同步。

- 因此**不输出 hreflang**——没有可指向的另一语言 URL，声明出去就是无效标记。
- 英文界面对搜索引擎不可分，等于放弃英文市场收录。这是当前最大的一块未开采流量（同类站点英文流量
  通常大于中文）。
- 路线：路径前缀 `/en/<tool>`（不用 `?lang=`，参数 URL 收录差且易与 canonical 冲突）→ `resolveInitialLocale()`
  优先读 URL → `changeLocale()` 改为导航 → sitemap 声明 `xmlns:xhtml` 并互指 → 静态壳按两个 locale 各出一套。
  该项动架构，需独立排期。

---

## 11. sitemap 与 robots

- 两者由 **prebuild** 生成到 `public/`，且**不入库**。必须在 `vite build` 之前：Vite 在 build 开始时就整体
  拷贝 `public/`，构建后再写赶不上当次产物，线上表现为 `/robots.txt` 落到 SPA fallback 返回 HTML。
- `lastmod` 取各工具真实的 `createdAt`（全站同一个日期等于没有日期，爬虫会忽略该字段）；
  首页与关于页取最近一个工具的上架日。
- **不写 `changefreq` / `priority`**：Google 明确声明会忽略，只增加噪音。
- robots：`User-agent: *` + `Allow: /` + `Sitemap:` + llms.txt 指路注释。域名一律取
  `src/config/site.ts` 的 `siteUrl`，环境变量 `SITE_URL` 仅用于预览环境临时覆盖。

---

## 12. 性能（Core Web Vitals）

- 静态壳让 LCP 内容不再依赖「JS 下载 → i18n await → React 挂载」，是最大的一项改善。
- HTML 缓存建议：`max-age=0, s-maxage=600, stale-while-revalidate=86400`（CDN 边缘缓存，降低回源与 TTFB 抖动）。
- 已知取舍：`initI18n` 首屏**同时加载中英文两套语言包**（命令面板要跨语言即时搜索），代价由首屏承担；
  语言路由化落地后应改为按语言加载。
- 待办：`public/fonts/` 约 111 MB 的 CJK 全字重字体转 woff2 子集，并确保只在用户选用字体时按需加载
  （`resume` 与 `music-to-video` 需要完整字表渲染任意文本，不能砍字）。
- 静态壳与首屏之间仍有一次内容重绘（`createRoot` 会清空容器）；要消除需换 `hydrateRoot`，
  前提是语言由 URL 决定，否则 hydration 不匹配会整树回退。

---

## 13. 权威度与外链

工具本身是可链接资产（linkable asset），优先做这几件事：

| 途径         | 做法                                                                                     |
| ------------ | ---------------------------------------------------------------------------------------- |
| 开源仓库     | GitHub 补齐 topics（`developer-tools`、`privacy-first`…），README 顶部放站点链接与截图   |
| Awesome 列表 | 向 `awesome-devtools`、`awesome-selfhosted` 等提 PR，遵守各仓库收录标准，不滥投          |
| 中文技术社区 | 掘金 / V2EX / 少数派发**真实故事型内容**（技术选型、隐私取舍、踩坑），不是硬广           |
| 差异化小工具 | `image-to-beads`、`chinese-kinship-calculator` 有天然传播性，值得单独做小红书 / B 站内容 |
| 未链接提及   | 定期搜 `tool.mmzhiku.xyz` 的无链接提及，联系补链                                         |

红线：购买链接、链接农场、目录刷量、隐藏文字、doorway page——触碰即可能被惩罚，不做。

---

## 14. 度量

上线即接，否则后面所有判断都没有基线。

| 平台                  | 动作                                                                                                |
| --------------------- | --------------------------------------------------------------------------------------------------- |
| Google Search Console | 验证域名属性 → 提交 sitemap → 用「网址检查」看**渲染后 HTML**是否与静态壳一致                       |
| Bing Webmaster Tools  | 同上，可导入 GSC 数据                                                                               |
| 百度搜索资源平台      | 验证站点 → 提交 sitemap → 移动适配（中文主渠道，必做）                                              |
| 分析                  | 用自部署的隐私友好方案（Plausible/Umami）或在隐私说明中披露；不要因分析工具破坏「不上传数据」的定位 |

KPI（按季度看，SEO 是复利曲线不是开关：收录改善 2–4 周可见，排名与流量通常 2–3 个月才成趋势）：

| 指标                                    | 目标                                           |
| --------------------------------------- | ---------------------------------------------- |
| 被索引页面数                            | ≥ 50（全站 URL），分类页上线后 ≥ 60            |
| 工具页源码含独立 TDK + H1 + 描述 + 内链 | 48 / 48 保持（静态壳保证，不允许回退）         |
| 结构化数据校验错误                      | 0（富结果测试与校验器全绿）                    |
| 非品牌自然点击                          | 建立基线后环比增长                             |
| 目标词 Top 3 占比                       | 3 个月 10% → 6 个月 30%                        |
| AI 渠道引用                             | 记录 ChatGPT/Perplexity 是否引用本站并给出链接 |

---

## 15. 验收清单

```bash
pnpm build

# 1) 静态壳：每条路由的标题必须是自己的，而不是首页的
grep -o "<title>[^<]*</title>" dist/hash-text/index.html
# 2) 结构化数据带 @context 且类型齐全
grep -o '"@context":"[^"]*"' dist/index.html | head -1
grep -o '"@type":"[A-Za-z]*"' dist/hash-text/index.html | sort -u
# 3) GEO 与收录文件已生成
head -5 dist/llms.txt && grep -c "<loc>" dist/sitemap.xml

# 线上（宿主是否解析目录索引，只能在这里验）
curl -s  https://tool.mmzhiku.xyz/hash-text | grep "<title>"   # 必须是工具标题
curl -sI https://tool.mmzhiku.xyz/llms.txt  | grep content-type # 期望 text/plain
curl -sI https://tool.mmzhiku.xyz/no-such-route | grep HTTP     # 期望 404（见下）
```

已知缺口（属托管层，需在宿主配置，不在构建里）：

- 未匹配路径当前返回 200（Soft 404），应出真 404 状态；
- `/tool` 与 `/tool/` 同页两份，应 301 归一到无尾斜杠形态；
- 若宿主不解析目录索引，静态壳不会命中——此时第 1 项线上检查会露馅，须改配 rewrite 或输出 `<route>.html`。

---

## 16. 外部依据

- **Google**：对 JS 页面两阶段索引——先抓原始 HTML，页面进渲染队列（headless Chromium）后在第二波提取内容；
  渲染可能耗时秒级到天级，并会因 JS 报错、资源超时、体积过大而失败。SSG 页面在第一阶段即可完成提取。
- **百度**：抓取与渲染分离，渲染能力显著低于真实浏览器，CSR 页面排队数小时至数天，正文与内链存在漏抓风险；
  官方文档多次强调服务端输出完整 HTML 是降低索引风险的最佳实践。
- **AI 爬虫**：绝大多数不执行 JavaScript，只读原始 HTML，没有渲染阶段。
- 行业结论一致：**CSR 是搜索表现最差的渲染方式**；内容不随请求变化的静态工具站，SSG/预渲染是性价比最优解。

---

_本文描述现行状态；实现变更时同步更新本文与 `docs/INDEX.md`，不留第二份并行叙述。_
