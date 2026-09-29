<div align="center">

# ToolBox

**免费开源的开发者在线工具箱** —— 48 个工具全部在浏览器本地运行，数据不上传服务器。

[中文](./README.md) · [English](./README.en.md)

![License MIT](https://img.shields.io/badge/license-MIT-0ea95e)
![release](https://img.shields.io/badge/release-v0.1.0-orange)
![tools](https://img.shields.io/badge/tools-48-brightgreen)
![built with React](https://img.shields.io/badge/built%20with-React%2019-61dafb)
![Vite](https://img.shields.io/badge/Vite-8-646cff)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6)

[在线使用](https://tool.mmzhiku.xyz) · [快速开始](#快速开始) · [功能](#功能) · [部署](#部署) · [文档](docs/INDEX.md) · [Issues](https://github.com/MmzMing/ToolBox/issues)

</div>

---

## 这是什么

一个纯前端的开发者工具箱，功能取向参考 [it-tools](https://github.com/CorentinTh/it-tools)：哈希与编码、
UUID/令牌生成、二维码、图片压缩、Cron 与 Chmod、时间戳、正则与 Git 速查、简历排版等。

没有后端、没有账号、没有埋点。粘贴进来的文本、上传的图片、生成的密钥都只停留在浏览器内存与
本机 `localStorage` 里，构建产物是一组静态文件，可以丢到任意静态托管平台。

## 功能

### 工具清单（9 个分类 / 48 个工具）

| 分类   | 数量 | 包含                                                                                                                             |
| ------ | ---- | -------------------------------------------------------------------------------------------------------------------------------- |
| 求职   | 2    | 简历工坊（9 套模板、分页预览、PDF 导出、本地文件夹同步）、工资计算器                                                             |
| 图片   | 6    | 二维码转换、WiFi 二维码、图片压缩转换、图片堆叠、图片转拼豆、AI 生图画布                                                         |
| 视频   | 1    | 文字PV（分镜式音乐视频，在线曲库默认关闭）                                                                                       |
| 加密   | 7    | 文本哈希计算、文本加密、Bcrypt 哈希、UUID / ULID 生成器、密钥工坊、密码强度分析、PDF 签名校验                                    |
| Web    | 8    | URL 解析、User-Agent 解析、设备信息、跳转链接解码、HTML 实体、OTP 验证码、域名解析查询、IP 查询                                  |
| 开发   | 9    | 格式工作台、编解码、时间戳转换、cURL 命令生成、Cron 表达式生成、Chmod 计算、颜色格式转换、Docker Run 转 Compose、GitHub 加速下载 |
| 文本   | 4    | Markdown 编辑器、文本对比、文本格式化、ASCII 艺术字                                                                              |
| 生活   | 3    | 亲戚关系计算、单位换算、今日运势抽签                                                                                             |
| 速查表 | 8    | HTTP 状态码、正则、Git、SQL、Docker、Maven、nvm、拍照                                                                            |

完整清单见 [docs/design/功能介绍文档.md](docs/design/功能介绍文档.md)。

### 站点能力

- **`Ctrl + K` 命令面板**：fuse.js 模糊搜索，中英文关键词与中文别名都能命中。
- **收藏与最近使用**：存 `localStorage`，带版本号与 `migrate` 兜底。
- **中英双语**：i18next，首访按浏览器语言协商，切换后持久化。
- **主题**：亮 / 暗 / 跟随系统，全站只用语义令牌，不写死颜色。
- **响应式三档**：手机 `<768`、平板 `768–1279`、PC `≥1280`，app-shell 布局，唯一滚动区是内容区。
- **SEO / GEO**：history 路由，每个工具一条独立 URL；构建期为**每条路由产出静态壳**
  （各自的 title / description / canonical / OG + `WebApplication`、`BreadcrumbList` 等 JSON-LD +
  可爬正文），不执行 JS 的爬虫（百度、AI 抓取）也能读到页面主题；另有 `llms.txt` 与
  `llms-full.txt` 作为 AI 引擎的站点索引。详见 [docs/seo/SEO与GEO策略.md](docs/seo/SEO与GEO策略.md)。

### 联网边界

只有下面这几处会出网，且都不经本站中转，其余一律本地：

1. **IP 查询**：取本机出口 IP（多源回退，避免单个服务商被网络干扰就查不到）与 `ipwho.is` 归属地。
2. **域名解析查询**：走公共 DoH 服务（阿里 AliDNS / Cloudflare / Google，按境内境外分组）。
3. **cURL 命令生成的「发送」**：只在你点击时由浏览器直连目标地址，用于实测自己写的请求。
4. **简历工坊与 AI 生图画布的 AI 功能**：默认关闭。开启前会一次性告知数据流向，需你自己填服务商的
   Base URL 与 Key，浏览器直连该服务商，没有中转或代理；Key 只存本地。
5. **文字PV 的在线曲库**：默认关闭。开启后你输入的歌单标识会发往所配置的 Meting 公共实例取音频直链。

## 快速开始

环境要求：Node `>= 20.19`，pnpm 11（`corepack enable` 即可拿到）。

```bash
pnpm install
pnpm dev            # http://localhost:5173
```

| 命令               | 作用                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------ |
| `pnpm dev`         | 开发服务器                                                                           |
| `pnpm build`       | 构建 `dist/`：生成 `sitemap.xml` / `robots.txt` / `llms.txt`，并为每条路由产出静态壳 |
| `pnpm preview`     | 本地预览构建产物                                                                     |
| `pnpm test`        | Vitest 单测 + 三项静态检查（i18n 重复键、工具 SEO 键与内容层、innerHTML 落点）       |
| `pnpm lint`        | ESLint，`--max-warnings 0`                                                           |
| `pnpm typecheck`   | `tsc -b`                                                                             |
| `pnpm create:tool` | 新建工具脚手架（四件套 + 测试镜像目录）                                              |

新增一个工具：在 `src/tools/<分类>/<工具名>/` 下产出 `index.ts`（注册）、`<Name>.tsx`（UI）、
`<工具名>.service.ts`（纯逻辑），并在该分类的 `index.ts` 里登记，文案走 `tools-<分类>` 命名空间的
i18n 键。规范细则见 [AGENTS.md](AGENTS.md)，样板工具是 `src/tools/crypto/hash-text/`。

## 部署

```bash
pnpm build   # 产出 dist/
```

三条硬性要求：

1. **必须配 SPA fallback**。站点用 history 路由，未匹配路径要回退到 `index.html`，否则深链接和刷新 404。
2. **`.js` / `.wasm` 要返回正确 MIME**。图片压缩转换的编解码器在运行时由 Worker 动态 `import()`，
   部分平台（腾讯云 EdgeOne Pages、Nginx 默认 `mime.types`）不认 `.mjs`，会回落成
   `application/octet-stream` 而被浏览器拒绝加载——因此构建前置脚本 `scripts/prepare-codecs.mjs`
   统一把编解码器入口产出为 `.js` 后缀。
3. **托管要先查文件再 rewrite**，构建产出的 `dist/<路由>/index.html` 静态壳才会命中。nginx 的
   `try_files $uri $uri/ /index.html`、Vercel 与 Netlify 的静态优先都满足；只配 SPA fallback 时深链接
   会退回首页壳，各页标题与正文又变回同一份（用 `curl -s https://<域名>/hash-text | grep "<title>"` 验收）。

| 平台                 | 构建命令     | 输出目录                | SPA fallback                                       |
| -------------------- | ------------ | ----------------------- | -------------------------------------------------- |
| Vercel               | `pnpm build` | `dist`                  | `vercel.json` 的 `rewrites`（或框架预设）          |
| Netlify              | `pnpm build` | `dist`                  | `netlify.toml` 的 `[[redirects]] /* → /index.html` |
| Cloudflare Pages     | `pnpm build` | `dist`                  | 开启 Single-page application 开关                  |
| Docker + Nginx       | 多阶段构建   | `/usr/share/nginx/html` | `try_files $uri $uri/ /index.html`                 |
| 腾讯云 EdgeOne Pages | `pnpm build` | `dist`                  | 平台侧配置，注意上文的 MIME 限制                   |

站点域名取 [`src/config/site.ts`](src/config/site.ts) 的 `siteUrl`（当前 `https://tool.mmzhiku.xyz`），
`sitemap.xml`、`robots.txt` 与 `llms.txt` 都由它生成；环境变量 `SITE_URL` 只用于临时覆盖（预览环境）。
Dockerfile、`nginx.conf`、各平台完整配置与发布检查清单见
[docs/deployment/部署方案.md](docs/deployment/部署方案.md)。

## 文档

- [docs/INDEX.md](docs/INDEX.md) — 文档总索引
- [docs/design/技术栈文档.md](docs/design/技术栈文档.md) — 选型、依赖清单、质量门禁
- [docs/design/详细设计文档.md](docs/design/详细设计文档.md) — 架构、注册表机制、状态、i18n、SEO
- [docs/design/功能介绍文档.md](docs/design/功能介绍文档.md) — 站点功能与全量工具清单
- [docs/seo/SEO与GEO策略.md](docs/seo/SEO与GEO策略.md) — 收录架构、页面与内容规范、AI 引擎可见性
- [docs/development/开发计划.md](docs/development/开发计划.md) — 阶段推进记录
- [AGENTS.md](AGENTS.md) — 代码规范（人与 AI 代理共同遵守）

## 许可

[MIT](./LICENSE) © 2026 mmzhiku
