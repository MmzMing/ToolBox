<div align="center">

# ToolBox

**A free, open-source toolbox for developers** — 48 tools that all run locally in the browser. Nothing is uploaded.

[中文](./README.md) · [English](./README.en.md)

![License MIT](https://img.shields.io/badge/license-MIT-0ea95e)
![release](https://img.shields.io/badge/release-v0.1.0-orange)
![tools](https://img.shields.io/badge/tools-48-brightgreen)
![built with React](https://img.shields.io/badge/built%20with-React%2019-61dafb)
![Vite](https://img.shields.io/badge/Vite-8-646cff)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6)

[Live site](https://tool.mmzhiku.xyz) · [Quick start](#quick-start) · [Features](#features) · [Deployment](#deployment) · [Docs](docs/INDEX.md) · [Issues](https://github.com/MmzMing/ToolBox/issues)

</div>

---

## What this is

A pure-frontend developer toolbox, modelled on [it-tools](https://github.com/CorentinTh/it-tools):
hashing and encoding, UUID/token generation, QR codes, image compression, cron and chmod,
timestamps, regex and git cheatsheets, resume typesetting, and more.

No backend, no accounts, no analytics. The text you paste, the images you drop and the keys you
generate stay in browser memory and your own `localStorage`; the build output is a set of static
files you can host anywhere.

## Features

### Tools (9 categories / 48 tools)

| Category    | Count | Includes                                                                                                                                                      |
| ----------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Job Search  | 2     | Resume Studio (9 templates, page breaks, PDF export, folder sync), Salary Calculator                                                                          |
| Images      | 6     | QR Code Converter, WiFi QR, Image Compress & Convert, Image Stack, Image to Perler Beads, AI Image Gen Canvas                                                 |
| Video       | 1     | Text PV (storyboard music video; online music library off by default)                                                                                         |
| Crypto      | 7     | Hash Text, Text Encryption, Bcrypt Hash, UUID / ULID Generator, Key Generator, Password Strength, PDF Signature Checker                                       |
| Web         | 8     | URL Parser, User-Agent Parser, Device Information, Safelink Decoder, HTML Entities, OTP, DNS Lookup, IP Lookup                                                |
| Development | 9     | Format Studio, Encoder / Decoder, Timestamp Converter, cURL Command Builder, Cron, Chmod, Color Converter, Docker Run to Compose, GitHub Download Accelerator |
| Text        | 4     | Markdown Editor, Text Diff, Text Formatter, ASCII Text Drawer                                                                                                 |
| Life        | 3     | Chinese Kinship Calculator, Unit Converter, Daily Fortune Draw                                                                                                |
| Cheatsheets | 8     | HTTP Status Codes, Regex, Git, SQL, Docker, Maven, nvm, Photography                                                                                           |

The full list lives in [docs/design/功能介绍文档.md](docs/design/功能介绍文档.md) (Chinese).

### Site features

- **`Ctrl + K` command palette**: fuzzy search via fuse.js, matching English keywords and aliases.
- **Favorites and recent tools**: kept in `localStorage`, versioned with a `migrate` fallback.
- **Bilingual (Chinese / English)**: i18next, first visit negotiated from the browser language,
  the choice is persisted.
- **Theming**: light / dark / system, semantic tokens only — no hard-coded colors.
- **Three responsive tiers**: phone `<768`, tablet `768–1279`, desktop `≥1280`, app-shell layout
  where the content area is the only scroll container.
- **SEO / GEO**: history routing with one URL per tool. The build emits a **static shell per route**
  (its own title / description / canonical / OG, `WebApplication` and `BreadcrumbList` JSON-LD, plus
  crawlable body text), so crawlers that never run JavaScript — Baidu, AI fetchers — still see the
  page topic. `llms.txt` and `llms-full.txt` give AI engines a site index. Details in
  [docs/seo/SEO与GEO策略.md](docs/seo/SEO与GEO策略.md) (Chinese).

### What leaves the browser

These are the only features that touch the network, and none of them is proxied through this site;
everything else stays local:

1. **IP lookup**: resolves your egress IP through a fallback chain of echo services (so one provider
   being unreachable doesn't break it) and looks up geolocation via `ipwho.is`.
2. **DNS lookup**: queries public DoH resolvers (AliDNS / Cloudflare / Google, grouped by region).
3. **The cURL builder's "send" action**: only on your click, straight from the browser to the target
   URL, so you can test a request you just described.
4. **AI in Resume Studio and AI Image Gen Canvas**: off by default. Enabling them shows a one-time
   notice about where data goes; you supply the provider's base URL and API key yourself, the browser
   talks to that provider directly with no proxy in between, and the key never leaves your machine.
5. **The online music library in Text PV**: off by default. Once enabled, the playlist id you type is
   sent to the Meting instance you configure to resolve a playable audio URL.

## Quick start

Requirements: Node `>= 20.19` and pnpm 11 (`corepack enable` installs it).

```bash
pnpm install
pnpm dev            # http://localhost:5173
```

| Command            | Purpose                                                                                                         |
| ------------------ | --------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`         | Dev server                                                                                                      |
| `pnpm build`       | Build `dist/`: emits `sitemap.xml` / `robots.txt` / `llms.txt` and one static shell per route                   |
| `pnpm preview`     | Preview the build locally                                                                                       |
| `pnpm test`        | Vitest unit tests + three static checks (i18n duplicate keys, tool SEO keys and content layer, innerHTML sinks) |
| `pnpm lint`        | ESLint with `--max-warnings 0`                                                                                  |
| `pnpm typecheck`   | `tsc -b`                                                                                                        |
| `pnpm create:tool` | Scaffold a new tool (files + mirrored test dir)                                                                 |

To add a tool, create `src/tools/<category>/<tool-name>/` with `index.ts` (registration),
`<Name>.tsx` (UI) and `<tool-name>.service.ts` (pure logic), then register it in that category's
`index.ts`. User-facing copy goes through the `tools-<category>` i18n namespace.
Conventions are in [AGENTS.md](AGENTS.md); the reference implementation is `src/tools/crypto/hash-text/`.

## Deployment

```bash
pnpm build   # emits dist/
```

Three hard requirements:

1. **SPA fallback is mandatory.** The app uses history routing, so unmatched paths must serve
   `index.html` — otherwise deep links and refreshes return 404.
2. **`.js` / `.wasm` must be served with the right MIME.** The image codec workers `import()` WASM
   glue at runtime. Some hosts (Tencent EdgeOne Pages, stock Nginx `mime.types`) don't know `.mjs`
   and fall back to `application/octet-stream`, which the browser refuses to load as a module — so
   `scripts/prepare-codecs.mjs` rewrites every codec entry point to a `.js` extension before the build.
3. **The host must check the filesystem before rewriting**, otherwise the per-route static shells in
   `dist/<route>/index.html` never get served. nginx's `try_files $uri $uri/ /index.html` and the
   static-first behaviour of Vercel and Netlify both qualify; with a plain SPA fallback a deep link
   falls back to the home shell and every page shows the same title and body again. Verify with
   `curl -s https://<host>/hash-text | grep "<title>"`.

| Host                  | Build command | Output                  | SPA fallback                                          |
| --------------------- | ------------- | ----------------------- | ----------------------------------------------------- |
| Vercel                | `pnpm build`  | `dist`                  | `rewrites` in `vercel.json` (or the framework preset) |
| Netlify               | `pnpm build`  | `dist`                  | `[[redirects]] /* → /index.html` in `netlify.toml`    |
| Cloudflare Pages      | `pnpm build`  | `dist`                  | Enable the Single-page application toggle             |
| Docker + Nginx        | multi-stage   | `/usr/share/nginx/html` | `try_files $uri $uri/ /index.html`                    |
| Tencent EdgeOne Pages | `pnpm build`  | `dist`                  | Configured in the console; mind the MIME note above   |

The domain comes from `siteUrl` in [`src/config/site.ts`](src/config/site.ts)
(currently `https://tool.mmzhiku.xyz`), which is what `sitemap.xml`, `robots.txt` and `llms.txt` are
generated from; the `SITE_URL` environment variable only overrides it temporarily (preview deployments).
The Dockerfile, `nginx.conf`, per-platform configuration and the release checklist are in
[docs/deployment/部署方案.md](docs/deployment/部署方案.md) (Chinese).

## Documentation

- [docs/INDEX.md](docs/INDEX.md) — documentation index
- [docs/design/技术栈文档.md](docs/design/技术栈文档.md) — stack, dependency list, quality gates (Chinese)
- [docs/design/详细设计文档.md](docs/design/详细设计文档.md) — architecture, tool registry, state, i18n, SEO (Chinese)
- [docs/design/功能介绍文档.md](docs/design/功能介绍文档.md) — feature tour and full tool list (Chinese)
- [docs/seo/SEO与GEO策略.md](docs/seo/SEO与GEO策略.md) — indexing architecture, page and content rules, AI-engine visibility (Chinese)
- [docs/development/开发计划.md](docs/development/开发计划.md) — stage-by-stage delivery record (Chinese)
- [AGENTS.md](AGENTS.md) — code conventions (for humans and AI agents alike)

## License

[MIT](./LICENSE) © 2026 mmzhiku
