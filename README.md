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

### 工具清单（8 个分类 / 48 个工具）

| 分类       | 数量 | 包含                                                        |
| ---------- | ---- | ----------------------------------------------------------- |
| 简历       | 1    | 简历工坊（9 套模板、分页预览、PDF 导出、本地文件夹同步）    |
| 加密       | 10   | 文本哈希、AES/RSA、HMAC、Bcrypt、UUID、ULID、令牌、密码强度 |
| Web        | 11   | URL 解析、HTML 实体、UA 解析、Meta 标签、Basic Auth、OTP    |
| 开发       | 10   | 代码格式化、编解码、格式转换、Cron、Chmod、颜色、时间戳     |
| 速查表     | 4    | HTTP 状态码、正则、Git、拍照参数                            |
| 图片和视频 | 3    | 二维码转换、WiFi 二维码、图片压缩转换（WASM）               |
| 文本       | 6    | 文本对比、统计、命名转换、Emoji、乱数假文、ASCII 艺术字     |
| 生活       | 3    | 亲戚关系计算、五险一金、单位换算                            |

完整清单见 [docs/design/功能介绍文档.md](docs/design/功能介绍文档.md)。

### 站点能力

- **`Ctrl + K` 命令面板**：fuse.js 模糊搜索，中英文关键词与中文别名都能命中。
- **收藏与最近使用**：存 `localStorage`，带版本号与 `migrate` 兜底。
- **中英双语**：i18next，首访按浏览器语言协商，切换后持久化。
- **主题**：亮 / 暗 / 跟随系统，全站只用语义令牌，不写死颜色。
- **响应式三档**：手机 `<768`、平板 `768–1279`、PC `≥1280`，app-shell 布局，唯一滚动区是内容区。
- **SEO**：history 路由，每个工具一条独立 URL，构建时自动生成 `sitemap.xml` 与 `robots.txt`。

### 联网边界

只有两处会出网，其余一律本地：

1. **IP 查询**：取本机出口 IP（多源回退，避免单个服务商被网络干扰就查不到）与 `ipwho.is` 归属地。
2. **简历工坊的 AI 功能**：默认关闭。开启前会一次性告知数据流向，需你自己填服务商的
   Base URL 与 Key，浏览器直连该服务商，没有中转或代理；Key 只存本地。

## 快速开始

环境要求：Node `>= 20.19`，pnpm 11（`corepack enable` 即可拿到）。

```bash
pnpm install
pnpm dev            # http://localhost:5173
```

| 命令               | 作用                                    |
| ------------------ | --------------------------------------- |
| `pnpm dev`         | 开发服务器                              |
| `pnpm build`       | 构建 `dist/`，并生成 `sitemap.xml`      |
| `pnpm preview`     | 本地预览构建产物                        |
| `pnpm test`        | Vitest 单测（含 i18n 重复键检查）       |
| `pnpm lint`        | ESLint，`--max-warnings 0`              |
| `pnpm typecheck`   | `tsc -b`                                |
| `pnpm create:tool` | 新建工具脚手架（四件套 + 测试镜像目录） |

新增一个工具：在 `src/tools/<分类>/<工具名>/` 下产出 `index.ts`（注册）、`<Name>.tsx`（UI）、
`<工具名>.service.ts`（纯逻辑），并在该分类的 `index.ts` 里登记，文案走 `tools-<分类>` 命名空间的
i18n 键。规范细则见 [AGENTS.md](AGENTS.md)，样板工具是 `src/tools/crypto/hash-text/`。

## 部署

```bash
pnpm build   # 产出 dist/
```

两条硬性要求：

1. **必须配 SPA fallback**。站点用 history 路由，未匹配路径要回退到 `index.html`，否则深链接和刷新 404。
2. **`.js` / `.wasm` 要返回正确 MIME**。图片压缩转换的编解码器在运行时由 Worker 动态 `import()`，
   部分平台（腾讯云 EdgeOne Pages、Nginx 默认 `mime.types`）不认 `.mjs`，会回落成
   `application/octet-stream` 而被浏览器拒绝加载——因此构建前置脚本 `scripts/prepare-codecs.mjs`
   统一把编解码器入口产出为 `.js` 后缀。

| 平台                 | 构建命令     | 输出目录                | SPA fallback                                       |
| -------------------- | ------------ | ----------------------- | -------------------------------------------------- |
| Vercel               | `pnpm build` | `dist`                  | `vercel.json` 的 `rewrites`（或框架预设）          |
| Netlify              | `pnpm build` | `dist`                  | `netlify.toml` 的 `[[redirects]] /* → /index.html` |
| Cloudflare Pages     | `pnpm build` | `dist`                  | 开启 Single-page application 开关                  |
| Docker + Nginx       | 多阶段构建   | `/usr/share/nginx/html` | `try_files $uri $uri/ /index.html`                 |
| 腾讯云 EdgeOne Pages | `pnpm build` | `dist`                  | 平台侧配置，注意上文的 MIME 限制                   |

站点域名取 [`src/config/site.ts`](src/config/site.ts) 的 `siteUrl`（当前 `https://tool.mmzhiku.xyz`），
`sitemap.xml` 与 `robots.txt` 由它生成；环境变量 `SITE_URL` 只用于临时覆盖（预览环境）。
Dockerfile、`nginx.conf`、各平台完整配置与发布检查清单见
[docs/deployment/部署方案.md](docs/deployment/部署方案.md)。

## 文档

- [docs/INDEX.md](docs/INDEX.md) — 文档总索引
- [docs/design/技术栈文档.md](docs/design/技术栈文档.md) — 选型、依赖清单、质量门禁
- [docs/design/详细设计文档.md](docs/design/详细设计文档.md) — 架构、注册表机制、状态、i18n、SEO
- [AGENTS.md](AGENTS.md) — 代码规范（人与 AI 代理共同遵守）

## 许可

[MIT](./LICENSE) © 2026 mmzhiku
